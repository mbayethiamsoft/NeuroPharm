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

// GET /api/sales/pending/[id] — détail d'une vente en attente
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await context.params

    const pendingSale = await prisma.pendingSale.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!pendingSale) {
      return NextResponse.json({ error: 'Vente en attente introuvable' }, { status: 404 })
    }

    const author = await prisma.user.findUnique({
      where: { id: pendingSale.userId },
      select: { firstName: true, lastName: true },
    })

    return NextResponse.json({
      pendingSale: {
        ...pendingSale,
        author: author
          ? `${author.firstName ?? ''} ${author.lastName ?? ''}`.trim() || '—'
          : '—',
      },
    })
  } catch (error) {
    console.error('Error fetching pending sale:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la vente en attente' },
      { status: 500 }
    )
  }
}

// PATCH /api/sales/pending/[id] — met à jour la raison / la note d'une vente en attente
// (les items ne sont pas modifiables ici : si le panier change, on annule et on en recrée une.)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await context.params
    const body = await request.json()
    const { reason, note } = body

    if (reason !== undefined && !(VALID_REASONS as readonly string[]).includes(reason)) {
      return NextResponse.json({ error: 'Raison invalide' }, { status: 400 })
    }

    const existing = await prisma.pendingSale.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Vente en attente introuvable' }, { status: 404 })
    }
    if (existing.status !== 'active') {
      return NextResponse.json(
        { error: 'Seules les ventes actives peuvent être modifiées' },
        { status: 400 }
      )
    }

    const data: Record<string, unknown> = {}
    if (reason !== undefined) data.reason = reason
    if (note !== undefined) data.note = note ? String(note).trim() || null : null

    const updated = await prisma.pendingSale.update({
      where: { id },
      data,
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'UPDATE_PENDING_SALE',
      entity: 'pending_sale',
      entityId: id,
      details: JSON.stringify({ reason: data.reason ?? null, note: data.note ?? null }),
    })

    return NextResponse.json({ pendingSale: updated })
  } catch (error) {
    console.error('Error updating pending sale:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la vente en attente' },
      { status: 500 }
    )
  }
}

// DELETE /api/sales/pending/[id] — annule une vente en attente (soft : status=cancelled)
// On garde l'enregistrement pour l'audit / l'historique. Pas d'impact stock (jamais réservé).
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await context.params

    const existing = await prisma.pendingSale.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Vente en attente introuvable' }, { status: 404 })
    }
    if (existing.status !== 'active') {
      return NextResponse.json(
        { error: 'Cette vente ne peut plus être annulée (déjà finalisée ou annulée)' },
        { status: 400 }
      )
    }

    const updated = await prisma.pendingSale.update({
      where: { id },
      data: { status: 'cancelled' },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'CANCEL_PENDING_SALE',
      entity: 'pending_sale',
      entityId: id,
    })

    return NextResponse.json({ pendingSale: updated })
  } catch (error) {
    console.error('Error cancelling pending sale:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'annulation de la vente en attente' },
      { status: 500 }
    )
  }
}
