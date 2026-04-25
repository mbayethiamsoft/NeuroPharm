import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'
import { CREDIT_NOTE_REASONS, deriveCreditNoteStatus } from '@/lib/credit-note'

const REASON_SET = new Set<string>(CREDIT_NOTE_REASONS)

// Le montant restant n'est pas stocké : il se déduit de amount - usedAmount.
// Pareil pour le statut effectif (active / partially_used / used / expired)
// qui peut basculer en "expired" simplement parce que la date passe — donc
// on le recalcule à la lecture plutôt que de planifier un cron.
function enrichCreditNote<T extends { amount: number; usedAmount: number; expiresAt: Date | null; status: string }>(cn: T) {
  const remaining = Math.max(0, cn.amount - cn.usedAmount)
  const effectiveStatus = deriveCreditNoteStatus({
    amount: cn.amount,
    usedAmount: cn.usedAmount,
    expiresAt: cn.expiresAt,
    status: cn.status,
  })
  return { ...cn, remaining, effectiveStatus }
}

// GET /api/credit-notes — liste paginée + filtres + agrégats
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim() || ''
    const status = searchParams.get('status') || '' // active | partially_used | used | expired | cancelled
    const customerId = searchParams.get('customerId') || ''
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: Record<string, unknown> = {
      pharmacyId: session.pharmacyId,
    }

    if (customerId) where.customerId = customerId

    if (search) {
      // On accepte n° d'avoir (8 derniers car.), nom et téléphone client.
      where.OR = [
        { id: { endsWith: search.toLowerCase() } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search } },
      ]
    }

    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {}
      if (dateFrom) {
        const f = new Date(dateFrom)
        f.setHours(0, 0, 0, 0)
        range.gte = f
      }
      if (dateTo) {
        const t = new Date(dateTo)
        t.setHours(23, 59, 59, 999)
        range.lte = t
      }
      where.createdAt = range
    }

    const rows = await prisma.creditNote.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        originSale: { select: { id: true, total: true, createdAt: true } },
      },
    })

    let enriched = rows.map(enrichCreditNote)

    if (status) {
      enriched = enriched.filter((r) => r.effectiveStatus === status)
    }

    const totals = enriched.reduce(
      (acc, r) => {
        acc.totalIssued += r.amount
        acc.totalUsed += r.usedAmount
        acc.outstanding += r.remaining
        if (r.effectiveStatus === 'active' || r.effectiveStatus === 'partially_used') {
          acc.activeCount += 1
        }
        return acc
      },
      { totalIssued: 0, totalUsed: 0, outstanding: 0, activeCount: 0 }
    )

    return NextResponse.json({
      creditNotes: enriched,
      totals: { ...totals, totalCount: enriched.length },
    })
  } catch (error) {
    console.error('Error fetching credit notes:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/credit-notes — crée un avoir
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const body = await request.json()
    const amount = Number(body.amount)
    const reason = String(body.reason || 'OTHER').toUpperCase()
    const notes = body.notes ? String(body.notes).trim() || null : null
    const expiresAtRaw = body.expiresAt ? String(body.expiresAt).trim() : ''
    const customerIdRaw = body.customerId ? String(body.customerId).trim() : ''
    const customerNameRaw = body.customerName ? String(body.customerName).trim() : ''
    const customerPhoneRaw = body.customerPhone ? String(body.customerPhone).trim() : ''
    const originSaleIdRaw = body.originSaleId ? String(body.originSaleId).trim() : ''

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 })
    }
    if (!REASON_SET.has(reason)) {
      return NextResponse.json({ error: 'Motif invalide' }, { status: 400 })
    }

    let expiresAt: Date | null = null
    if (expiresAtRaw) {
      const d = new Date(expiresAtRaw)
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Date d\'expiration invalide' }, { status: 400 })
      }
      // Si l'utilisateur saisit une date sans heure, on positionne à 23:59:59
      // pour que l'avoir reste valable toute la journée d'expiration.
      d.setHours(23, 59, 59, 999)
      expiresAt = d
    }

    let customerId: string | null = null
    let snapshotName: string | null = customerNameRaw || null
    let snapshotPhone: string | null = customerPhoneRaw || null
    if (customerIdRaw) {
      const customer = await prisma.customer.findFirst({
        where: { id: customerIdRaw, pharmacyId: session.pharmacyId },
      })
      if (!customer) {
        return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
      }
      customerId = customer.id
      snapshotName = customer.fullName
      snapshotPhone = customer.phone
    }

    let originSaleId: string | null = null
    if (originSaleIdRaw) {
      const originSale = await prisma.sale.findFirst({
        where: { id: originSaleIdRaw, pharmacyId: session.pharmacyId },
      })
      if (!originSale) {
        return NextResponse.json({ error: 'Vente d\'origine introuvable' }, { status: 404 })
      }
      originSaleId = originSale.id
    }

    const creditNote = await prisma.creditNote.create({
      data: {
        pharmacyId: session.pharmacyId,
        customerId,
        customerName: snapshotName,
        customerPhone: snapshotPhone,
        originSaleId,
        reason,
        amount,
        notes,
        expiresAt,
        createdBy: session.id,
      },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'CREDIT_NOTE_CREATE',
      entity: 'credit_note',
      entityId: creditNote.id,
      details: JSON.stringify({
        amount,
        reason,
        customerId,
        originSaleId,
      }),
    })

    return NextResponse.json({ creditNote: enrichCreditNote(creditNote) }, { status: 201 })
  } catch (error) {
    console.error('Error creating credit note:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
