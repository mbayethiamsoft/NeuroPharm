import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'
import { deriveCreditNoteStatus } from '@/lib/credit-note'

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

// GET /api/credit-notes/[id] — détail + historique d'utilisation
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }
    const { id } = await params

    const cn = await prisma.creditNote.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        originSale: { select: { id: true, total: true, createdAt: true, customerName: true } },
        usages: {
          orderBy: { createdAt: 'desc' },
          include: {
            sale: {
              select: {
                id: true,
                total: true,
                createdAt: true,
                customerName: true,
                paymentMethod: true,
              },
            },
          },
        },
      },
    })

    if (!cn) {
      return NextResponse.json({ error: 'Avoir introuvable' }, { status: 404 })
    }

    return NextResponse.json({ creditNote: enrichCreditNote(cn) })
  } catch (error) {
    console.error('Error fetching credit note:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PATCH /api/credit-notes/[id] — annulation (status=cancelled) ou édition légère
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }
    const { id } = await params

    const existing = await prisma.creditNote.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Avoir introuvable' }, { status: 404 })
    }

    const body = await request.json()
    const action = body.action ? String(body.action) : null

    if (action === 'cancel') {
      if (existing.status === 'cancelled') {
        return NextResponse.json({ error: 'Avoir déjà annulé' }, { status: 400 })
      }
      const updated = await prisma.creditNote.update({
        where: { id },
        data: { status: 'cancelled' },
      })
      await createAuditLog({
        pharmacyId: session.pharmacyId,
        userId: session.id,
        action: 'CREDIT_NOTE_CANCEL',
        entity: 'credit_note',
        entityId: id,
        details: JSON.stringify({
          reason: existing.reason,
          amount: existing.amount,
          usedAmount: existing.usedAmount,
        }),
      })
      return NextResponse.json({ creditNote: enrichCreditNote(updated) })
    }

    // Édition légère : notes et date d'expiration uniquement (le montant et le
    // motif sont figés après création — pour les changer, annuler puis recréer).
    const data: Record<string, unknown> = {}
    if (body.notes !== undefined) {
      data.notes = body.notes ? String(body.notes).trim() || null : null
    }
    if (body.expiresAt !== undefined) {
      if (body.expiresAt) {
        const d = new Date(String(body.expiresAt))
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
        }
        d.setHours(23, 59, 59, 999)
        data.expiresAt = d
      } else {
        data.expiresAt = null
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucune modification' }, { status: 400 })
    }

    const updated = await prisma.creditNote.update({ where: { id }, data })
    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'UPDATE',
      entity: 'credit_note',
      entityId: id,
      details: JSON.stringify(data),
    })
    return NextResponse.json({ creditNote: enrichCreditNote(updated) })
  } catch (error) {
    console.error('Error updating credit note:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// DELETE /api/credit-notes/[id] — suppression définitive
// Refusée si l'avoir a déjà été utilisé (préférer l'annulation).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }
    const { id } = await params

    const existing = await prisma.creditNote.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Avoir introuvable' }, { status: 404 })
    }
    if (existing.usedAmount > 0.009) {
      return NextResponse.json(
        { error: 'Cet avoir a déjà été utilisé — annulez-le plutôt que de le supprimer' },
        { status: 400 }
      )
    }

    await prisma.creditNote.delete({ where: { id } })
    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'DELETE',
      entity: 'credit_note',
      entityId: id,
      details: JSON.stringify({ amount: existing.amount, reason: existing.reason }),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting credit note:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
