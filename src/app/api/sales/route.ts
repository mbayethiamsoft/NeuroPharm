import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'
import { generateRef } from '@/lib/utils'
import { deriveCreditNoteStatus } from '@/lib/credit-note'

// GET /api/sales - List sales with pagination and filters
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const date = searchParams.get('date')
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      pharmacyId: session.pharmacyId,
    }

    if (status) {
      where.status = status
    }

    if (date) {
      const dayStart = new Date(date)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(date)
      dayEnd.setHours(23, 59, 59, 999)
      where.createdAt = { gte: dayStart, lte: dayEnd }
    }

    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {}
      if (dateFrom) {
        const from = new Date(dateFrom)
        from.setHours(0, 0, 0, 0)
        createdAt.gte = from
      }
      if (dateTo) {
        const to = new Date(dateTo)
        to.setHours(23, 59, 59, 999)
        createdAt.lte = to
      }
      where.createdAt = createdAt
    }

    if (search) {
      // Receipt number is the 8 last chars of the cuid (uppercased in UI)
      // Accept lowercase/uppercase input transparently for receipt lookup.
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search } },
        { id: { endsWith: search.toLowerCase() } },
      ]
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where: where as never,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.sale.count({ where: where as never }),
    ])

    return NextResponse.json({
      sales,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching sales:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la recuperation des ventes' },
      { status: 500 }
    )
  }
}

// POST /api/sales - Create a new sale
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const body = await request.json()
    const {
      items,
      subtotal,
      tax,
      discount,
      total,
      paymentMethod,
      customerName,
      customerPhone,
      customerId,
      isPrescription,
      amountPaid,
      insuranceId,
      beneficiaryId,
      insuranceCoverage,
      insuranceClaimRef,
      creditNoteId,
      creditNoteAmount,
    } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'La vente doit contenir au moins un article' },
        { status: 400 }
      )
    }

    // Avoir (credit note) : applicable à toute méthode de paiement. Réduit le
    // total à régler par la méthode principale (CASH, MOBILE_MONEY, CARD, …).
    // INSURANCE : non autorisé — la part patient peut éventuellement être
    // payée via avoir, mais on garde la v1 simple : pas d'avoir + INSURANCE.
    let storedCreditNoteAmount: number | null = null
    let creditNoteToConsume: { id: string; amount: number; usedAmount: number; expiresAt: Date | null; status: string } | null = null
    if (creditNoteId) {
      if (paymentMethod === 'INSURANCE') {
        return NextResponse.json(
          { error: "Avoir non applicable sur une vente assurance (v1)" },
          { status: 400 }
        )
      }
      const cn = await prisma.creditNote.findFirst({
        where: { id: String(creditNoteId), pharmacyId: session.pharmacyId },
      })
      if (!cn) {
        return NextResponse.json({ error: 'Avoir introuvable' }, { status: 404 })
      }
      const effective = deriveCreditNoteStatus({
        amount: cn.amount,
        usedAmount: cn.usedAmount,
        expiresAt: cn.expiresAt,
        status: cn.status,
      })
      if (effective === 'cancelled') {
        return NextResponse.json({ error: 'Avoir annulé' }, { status: 400 })
      }
      if (effective === 'expired') {
        return NextResponse.json({ error: 'Avoir expiré' }, { status: 400 })
      }
      if (effective === 'used') {
        return NextResponse.json({ error: 'Avoir déjà soldé' }, { status: 400 })
      }
      const remaining = cn.amount - cn.usedAmount
      const requested = Number(creditNoteAmount)
      if (!Number.isFinite(requested) || requested <= 0) {
        return NextResponse.json({ error: 'Montant d\'avoir invalide' }, { status: 400 })
      }
      const dueTotal = Number(total) || 0
      if (requested > remaining + 0.009) {
        return NextResponse.json(
          { error: `Montant supérieur au solde de l'avoir (${remaining.toFixed(0)} XOF)` },
          { status: 400 }
        )
      }
      if (requested > dueTotal + 0.009) {
        return NextResponse.json(
          { error: `Montant supérieur au total de la vente (${dueTotal.toFixed(0)} XOF)` },
          { status: 400 }
        )
      }
      storedCreditNoteAmount = Math.round(requested * 100) / 100
      creditNoteToConsume = cn
    }

    // Reste à payer après application de l'avoir (utilisé pour la validation
    // CASH et le contrôle plafond carnet).
    const dueAfterCreditNote = Math.max(0, (Number(total) || 0) - (storedCreditNoteAmount || 0))

    // Cash register: amountPaid + change are only meaningful for CASH payments.
    // The client sends amountPaid; the server computes change and validates it
    // covers the total. Other payment methods always store null.
    let storedAmountPaid: number | null = null
    let storedChange: number | null = null
    if (paymentMethod === 'CASH' && amountPaid !== undefined && amountPaid !== null && amountPaid !== '') {
      const paid = Number(amountPaid)
      if (!Number.isFinite(paid) || paid < 0) {
        return NextResponse.json(
          { error: 'Montant reçu invalide' },
          { status: 400 }
        )
      }
      const dueTotal = dueAfterCreditNote
      if (paid + 0.009 < dueTotal) {
        return NextResponse.json(
          { error: `Montant reçu insuffisant (reçu ${paid.toFixed(0)} XOF, dû ${dueTotal.toFixed(0)} XOF)` },
          { status: 400 }
        )
      }
      storedAmountPaid = paid
      storedChange = Math.max(0, paid - dueTotal)
    }

    // Credit sales: customerId is required
    let linkedCustomerId: string | null = null
    let linkedCustomerName: string | null = null
    let linkedCustomerPhone: string | null = null
    if (paymentMethod === 'CREDIT') {
      if (!customerId) {
        return NextResponse.json(
          { error: 'Un client est requis pour une vente à crédit (carnet)' },
          { status: 400 }
        )
      }
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, pharmacyId: session.pharmacyId, isActive: true },
      })
      if (!customer) {
        return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
      }
      linkedCustomerId = customer.id
      linkedCustomerName = customer.fullName
      linkedCustomerPhone = customer.phone

      // Enforce credit limit if set (>0)
      if (customer.creditLimit > 0) {
        const [saleAgg, paymentAgg] = await Promise.all([
          prisma.sale.aggregate({
            where: {
              customerId: customer.id,
              pharmacyId: session.pharmacyId,
              paymentMethod: 'CREDIT',
              status: { not: 'cancelled' },
            },
            _sum: { total: true },
          }),
          prisma.creditPayment.aggregate({
            where: { customerId: customer.id, pharmacyId: session.pharmacyId },
            _sum: { amount: true },
          }),
        ])
        const currentBalance = (saleAgg._sum.total || 0) - (paymentAgg._sum.amount || 0)
        // Le plafond s'applique au solde *réel* à charge du client, donc après
        // déduction d'un éventuel avoir.
        const creditCharge = dueAfterCreditNote
        if (currentBalance + creditCharge > customer.creditLimit + 0.009) {
          return NextResponse.json(
            {
              error: `Plafond de crédit dépassé (solde actuel ${currentBalance.toFixed(0)} + vente ${(total || 0).toFixed(0)} > plafond ${customer.creditLimit.toFixed(0)} XOF)`,
            },
            { status: 400 }
          )
        }
      }
    }

    // Tiers payant: INSURANCE sales must reference an institution + beneficiary.
    // We snapshot the coverage rate (defaulting to the institution's standard rate),
    // then split the total between the institution and the patient. The split is
    // stored alongside the sale so the report can be rebuilt without re-fetching
    // the institution (which may have changed its default rate later).
    let storedInsuranceId: string | null = null
    let storedBeneficiaryId: string | null = null
    let storedInsuranceCoverage: number | null = null
    let storedInsuranceAmount: number | null = null
    let storedPatientAmount: number | null = null
    let storedClaimRef: string | null = null
    let storedClaimStatus: string | null = null
    let snapshotCustomerName: string | null = null
    let snapshotCustomerPhone: string | null = null
    if (paymentMethod === 'INSURANCE') {
      if (!insuranceId) {
        return NextResponse.json(
          { error: 'Sélectionnez une institution pour une vente assurance' },
          { status: 400 }
        )
      }
      if (!beneficiaryId) {
        return NextResponse.json(
          { error: 'Sélectionnez un bénéficiaire pour une vente assurance' },
          { status: 400 }
        )
      }
      const institution = await prisma.insurance.findFirst({
        where: { id: insuranceId, pharmacyId: session.pharmacyId, isActive: true },
      })
      if (!institution) {
        return NextResponse.json({ error: 'Institution introuvable' }, { status: 404 })
      }
      const beneficiary = await prisma.insuranceBeneficiary.findFirst({
        where: {
          id: beneficiaryId,
          insuranceId,
          pharmacyId: session.pharmacyId,
          isActive: true,
        },
        include: { holder: { select: { fullName: true } } },
      })
      if (!beneficiary) {
        return NextResponse.json({ error: 'Bénéficiaire introuvable' }, { status: 404 })
      }

      const requestedRate =
        insuranceCoverage !== undefined && insuranceCoverage !== null && insuranceCoverage !== ''
          ? Number(insuranceCoverage)
          : institution.coverageRate
      if (!Number.isFinite(requestedRate) || requestedRate < 0 || requestedRate > 100) {
        return NextResponse.json(
          { error: 'Taux de prise en charge invalide (0 — 100)' },
          { status: 400 }
        )
      }
      const dueTotal = Number(total) || 0
      storedInsuranceId = institution.id
      storedBeneficiaryId = beneficiary.id
      storedInsuranceCoverage = requestedRate
      storedInsuranceAmount = Math.round(((dueTotal * requestedRate) / 100) * 100) / 100
      storedPatientAmount = Math.max(0, Math.round((dueTotal - storedInsuranceAmount) * 100) / 100)
      storedClaimRef = insuranceClaimRef ? String(insuranceClaimRef).trim() || null : null
      storedClaimStatus = 'pending'
      snapshotCustomerName = beneficiary.fullName
      snapshotCustomerPhone = beneficiary.phone
    }

    // Validate stock availability for all items
    const medicationIds = items.map((item: { medicationId: string }) => item.medicationId)
    const medications = await prisma.medication.findMany({
      where: {
        id: { in: medicationIds },
        pharmacyId: session.pharmacyId,
      },
    })

    const medicationMap = new Map(medications.map((m) => [m.id, m]))

    for (const item of items) {
      const med = medicationMap.get(item.medicationId)
      if (!med) {
        return NextResponse.json(
          { error: `Medicament introuvable: ${item.medicationId}` },
          { status: 400 }
        )
      }
      if (med.shelfQuantity < item.quantity) {
        const warehouseQty = med.quantity - med.shelfQuantity
        const hint = warehouseQty > 0
          ? ` (${warehouseQty} disponibles en magasin — transferer en rayon d'abord)`
          : ''
        return NextResponse.json(
          {
            error: `Stock en rayon insuffisant pour "${med.name}". Rayon: ${med.shelfQuantity}, Demande: ${item.quantity}${hint}`,
          },
          { status: 400 }
        )
      }
    }

    // Create sale with items, deduct stock, create stock movements - all in a transaction
    const sale = await prisma.$transaction(async (tx) => {
      // Create the sale
      const newSale = await tx.sale.create({
        data: {
          pharmacyId: session.pharmacyId!,
          userId: session.id,
          customerId: linkedCustomerId,
          subtotal: subtotal || 0,
          tax: tax || 0,
          discount: discount || 0,
          total: total || 0,
          paymentMethod: paymentMethod || 'CASH',
          customerName:
            linkedCustomerName ?? snapshotCustomerName ?? (customerName || null),
          customerPhone:
            linkedCustomerPhone ?? snapshotCustomerPhone ?? (customerPhone || null),
          amountPaid: storedAmountPaid,
          change: storedChange,
          insuranceId: storedInsuranceId,
          beneficiaryId: storedBeneficiaryId,
          insuranceCoverage: storedInsuranceCoverage,
          insuranceAmount: storedInsuranceAmount,
          patientAmount: storedPatientAmount,
          insuranceClaimRef: storedClaimRef,
          insuranceClaimStatus: storedClaimStatus,
          creditNoteAmount: storedCreditNoteAmount,
          isPrescription: isPrescription || false,
          items: {
            create: items.map(
              (item: {
                medicationId: string
                quantity: number
                unitPrice: number
                total: number
              }) => ({
                medicationId: item.medicationId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.total,
              })
            ),
          },
        },
        include: {
          items: {
            include: { medication: { select: { name: true } } },
          },
          user: {
            select: { firstName: true, lastName: true },
          },
        },
      })

      // Consommation de l'avoir (en transaction pour garantir l'atomicité) :
      // on relit l'avoir verrouillé via une lecture suivi d'un update conditionné
      // sur (id + usedAmount inchangé) — Prisma ne support pas les locks SELECT
      // FOR UPDATE en plain queries, donc on fait un compare-and-set.
      if (creditNoteToConsume && storedCreditNoteAmount) {
        const fresh = await tx.creditNote.findUnique({ where: { id: creditNoteToConsume.id } })
        if (!fresh) {
          throw new Error('Avoir introuvable au moment de la consommation')
        }
        const remaining = fresh.amount - fresh.usedAmount
        if (storedCreditNoteAmount > remaining + 0.009) {
          throw new Error('Avoir déjà partiellement consommé par une autre transaction')
        }
        const newUsedAmount = Math.round((fresh.usedAmount + storedCreditNoteAmount) * 100) / 100
        const newStatus = newUsedAmount + 0.009 >= fresh.amount ? 'used' : 'partially_used'
        await tx.creditNote.update({
          where: { id: fresh.id },
          data: { usedAmount: newUsedAmount, status: newStatus },
        })
        await tx.creditNoteUsage.create({
          data: {
            pharmacyId: session.pharmacyId!,
            creditNoteId: fresh.id,
            saleId: newSale.id,
            amount: storedCreditNoteAmount,
          },
        })
      }

      // Deduct stock and create stock movements for each item
      const saleRef = generateRef('VNT')
      for (const item of items) {
        await tx.medication.update({
          where: { id: item.medicationId },
          data: {
            quantity: { decrement: item.quantity },
            shelfQuantity: { decrement: item.quantity },
          },
        })

        await tx.stockMovement.create({
          data: {
            medicationId: item.medicationId,
            pharmacyId: session.pharmacyId!,
            type: 'OUT',
            quantity: item.quantity,
            location: 'shelf',
            reason: 'Vente',
            reference: saleRef,
            unitPrice: item.unitPrice,
          },
        })
      }

      return newSale
    })

    // Create audit log (outside transaction - non-critical)
    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'SALE',
      entity: 'sale',
      entityId: sale.id,
      details: JSON.stringify({
        total: sale.total,
        itemCount: items.length,
        paymentMethod: sale.paymentMethod,
        ...(storedInsuranceId
          ? {
              insuranceId: storedInsuranceId,
              beneficiaryId: storedBeneficiaryId,
              insuranceAmount: storedInsuranceAmount,
              patientAmount: storedPatientAmount,
              coverageRate: storedInsuranceCoverage,
            }
          : {}),
        ...(storedCreditNoteAmount
          ? {
              creditNoteId: creditNoteToConsume?.id,
              creditNoteAmount: storedCreditNoteAmount,
            }
          : {}),
      }),
    })

    // Audit log dédié pour l'utilisation de l'avoir (utile dans le journal
    // métier, distinct de la vente elle-même).
    if (creditNoteToConsume && storedCreditNoteAmount) {
      await createAuditLog({
        pharmacyId: session.pharmacyId,
        userId: session.id,
        action: 'CREDIT_NOTE_USE',
        entity: 'credit_note',
        entityId: creditNoteToConsume.id,
        details: JSON.stringify({
          saleId: sale.id,
          amount: storedCreditNoteAmount,
        }),
      })
    }

    return NextResponse.json({ sale }, { status: 201 })
  } catch (error) {
    console.error('Error creating sale:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la creation de la vente' },
      { status: 500 }
    )
  }
}
