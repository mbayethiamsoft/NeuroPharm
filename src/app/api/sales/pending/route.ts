import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

const VALID_REASONS = [
  'NO_PAYMENT',
  'MISSING_PRESCRIPTION',
  'AWAITING_INSURANCE',
  'OUT_OF_STOCK',
  'OTHER',
] as const

const VALID_PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY', 'CARD', 'INSURANCE', 'CREDIT'] as const

// GET /api/sales/pending — liste paginée des ventes en attente
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const status = searchParams.get('status') || 'active'
    const reason = searchParams.get('reason')
    const search = searchParams.get('search')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      pharmacyId: session.pharmacyId,
    }

    if (status !== 'all') {
      where.status = status
    }
    if (reason && (VALID_REASONS as readonly string[]).includes(reason)) {
      where.reason = reason
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
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search } },
        { id: { endsWith: search.toLowerCase() } },
      ]
    }

    const [pendingSales, total] = await Promise.all([
      prisma.pendingSale.findMany({
        where: where as never,
        include: {
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.pendingSale.count({ where: where as never }),
    ])

    return NextResponse.json({
      pendingSales,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching pending sales:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des ventes en attente' },
      { status: 500 }
    )
  }
}

// POST /api/sales/pending — crée une vente en attente
// ⚠ Aucune décrémentation de stock, aucun mouvement de stock.
// La finalisation passera par POST /api/sales (logique stock + audit centralisée là-bas).
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json()
    const {
      items,
      discountRate,
      tax,
      customerName,
      customerPhone,
      customerId,
      paymentMethod,
      insuranceId,
      beneficiaryId,
      insuranceCoverage,
      isPrescription,
      creditNoteId,
      creditNoteAmount,
      reason,
      note,
    } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'La vente en attente doit contenir au moins un article' },
        { status: 400 }
      )
    }

    if (!reason || !(VALID_REASONS as readonly string[]).includes(reason)) {
      return NextResponse.json(
        { error: 'Raison invalide ou manquante' },
        { status: 400 }
      )
    }

    if (
      paymentMethod &&
      !(VALID_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)
    ) {
      return NextResponse.json(
        { error: 'Mode de paiement invalide' },
        { status: 400 }
      )
    }

    for (const it of items) {
      if (!it.medicationName || typeof it.medicationName !== 'string') {
        return NextResponse.json(
          { error: 'Chaque article doit avoir un nom' },
          { status: 400 }
        )
      }
      const qty = Number(it.quantity)
      const price = Number(it.unitPrice)
      if (!Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json(
          { error: `Quantité invalide pour "${it.medicationName}"` },
          { status: 400 }
        )
      }
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json(
          { error: `Prix invalide pour "${it.medicationName}"` },
          { status: 400 }
        )
      }
    }

    // Vérifier que les médicaments référencés appartiennent bien à la pharmacie (si fournis)
    const medIds = items
      .map((i: { medicationId?: string }) => i.medicationId)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    if (medIds.length > 0) {
      const count = await prisma.medication.count({
        where: { id: { in: medIds }, pharmacyId: session.pharmacyId },
      })
      if (count !== new Set(medIds).size) {
        return NextResponse.json(
          { error: 'Un ou plusieurs médicaments sont introuvables' },
          { status: 400 }
        )
      }
    }

    // Calculs côté serveur
    const subtotal = items.reduce(
      (s: number, it: { quantity: number; unitPrice: number }) =>
        s + Number(it.quantity) * Number(it.unitPrice),
      0
    )
    const rate = Math.max(0, Math.min(100, Number(discountRate) || 0))
    const discount = Math.round((subtotal * rate) / 100)
    const taxAmount = Math.max(0, Number(tax) || 0)
    const total = Math.max(0, subtotal - discount + taxAmount)

    const coverage = insuranceCoverage != null ? Math.max(0, Math.min(100, Number(insuranceCoverage))) : null

    const pendingSale = await prisma.pendingSale.create({
      data: {
        pharmacyId: session.pharmacyId,
        userId: session.id,
        subtotal,
        discount,
        discountRate: rate,
        tax: taxAmount,
        total,
        customerName: customerName ? String(customerName).trim() || null : null,
        customerPhone: customerPhone ? String(customerPhone).trim() || null : null,
        customerId: customerId ? String(customerId) : null,
        paymentMethod: paymentMethod || null,
        insuranceId: insuranceId || null,
        beneficiaryId: beneficiaryId || null,
        insuranceCoverage: coverage,
        isPrescription: Boolean(isPrescription),
        creditNoteId: creditNoteId || null,
        creditNoteAmount: creditNoteAmount != null ? Number(creditNoteAmount) : null,
        reason,
        note: note ? String(note).trim() || null : null,
        items: {
          create: items.map(
            (it: {
              medicationId?: string | null
              medicationName: string
              medicationRef?: string | null
              quantity: number
              unitPrice: number
            }) => ({
              medicationId: it.medicationId || null,
              medicationName: String(it.medicationName).trim(),
              medicationRef: it.medicationRef ? String(it.medicationRef).trim() : null,
              quantity: Number(it.quantity),
              unitPrice: Number(it.unitPrice),
              total: Number(it.quantity) * Number(it.unitPrice),
            })
          ),
        },
      },
      include: { items: true },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'CREATE_PENDING_SALE',
      entity: 'pending_sale',
      entityId: pendingSale.id,
      details: JSON.stringify({
        total: pendingSale.total,
        itemCount: items.length,
        reason,
      }),
    })

    return NextResponse.json({ pendingSale }, { status: 201 })
  } catch (error) {
    console.error('Error creating pending sale:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de la vente en attente' },
      { status: 500 }
    )
  }
}
