import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

// POST /api/sales/pending/[id]/convert — marque la vente en attente comme convertie
// Appelée par le POS APRÈS la création réussie de la vraie Sale.
// Body : { convertedSaleId: string }
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await context.params
    const body = await request.json().catch(() => ({}))
    const convertedSaleId =
      typeof body?.convertedSaleId === 'string' ? body.convertedSaleId : null

    if (!convertedSaleId) {
      return NextResponse.json(
        { error: 'convertedSaleId requis' },
        { status: 400 }
      )
    }

    const existing = await prisma.pendingSale.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Vente en attente introuvable' }, { status: 404 })
    }
    if (existing.status !== 'active') {
      return NextResponse.json(
        { error: 'Cette vente n\'est plus en attente' },
        { status: 400 }
      )
    }

    // Vérifier que la vente cible existe bien et appartient à la même pharmacie
    const sale = await prisma.sale.findFirst({
      where: { id: convertedSaleId, pharmacyId: session.pharmacyId },
      select: { id: true },
    })
    if (!sale) {
      return NextResponse.json({ error: 'Vente cible introuvable' }, { status: 400 })
    }

    const updated = await prisma.pendingSale.update({
      where: { id },
      data: {
        status: 'converted',
        convertedSaleId,
        convertedAt: new Date(),
      },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'CONVERT_PENDING_SALE',
      entity: 'pending_sale',
      entityId: id,
      details: JSON.stringify({ convertedSaleId }),
    })

    return NextResponse.json({ pendingSale: updated })
  } catch (error) {
    console.error('Error converting pending sale:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la conversion de la vente en attente' },
      { status: 500 }
    )
  }
}
