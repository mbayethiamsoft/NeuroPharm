import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

// GET /api/proformas/[id] - Détail d'un devis (avec items + auteur)
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

    const proforma = await prisma.proforma.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!proforma) {
      return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })
    }

    // Charger l'auteur séparément (pas de relation Prisma — évite une jointure lourde)
    const author = await prisma.user.findUnique({
      where: { id: proforma.userId },
      select: { firstName: true, lastName: true },
    })

    return NextResponse.json({
      proforma: {
        ...proforma,
        author: author
          ? `${author.firstName ?? ''} ${author.lastName ?? ''}`.trim() || '—'
          : '—',
      },
    })
  } catch (error) {
    console.error('Error fetching proforma:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du devis' },
      { status: 500 }
    )
  }
}

// PUT /api/proformas/[id] - Marquer un devis comme converti ou annulé.
// Le corps accepte uniquement { status, convertedSaleId? }. Pour modifier le
// contenu du devis (items, prix…), supprimer et recréer — simplifie le modèle.
export async function PUT(
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
    const { status, convertedSaleId } = body

    if (!['active', 'converted', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    }

    const existing = await prisma.proforma.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })
    }

    const updated = await prisma.proforma.update({
      where: { id },
      data: {
        status,
        convertedSaleId: status === 'converted' ? (convertedSaleId || null) : null,
        convertedAt: status === 'converted' ? new Date() : null,
      },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'UPDATE',
      entity: 'proforma',
      entityId: id,
      details: JSON.stringify({ status, convertedSaleId: convertedSaleId || null }),
    })

    return NextResponse.json({ proforma: updated })
  } catch (error) {
    console.error('Error updating proforma:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour du devis' },
      { status: 500 }
    )
  }
}

// DELETE /api/proformas/[id] - Supprimer un devis (hard delete, pas de soft delete
// puisqu'un devis n'a aucune valeur comptable à conserver obligatoirement).
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

    const existing = await prisma.proforma.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })
    }

    await prisma.proforma.delete({ where: { id } })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'DELETE',
      entity: 'proforma',
      entityId: id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting proforma:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression du devis' },
      { status: 500 }
    )
  }
}
