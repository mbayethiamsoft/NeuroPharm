import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'
import { generateRef } from '@/lib/utils'

// POST /api/stock/transfer — move quantity from warehouse to shelf
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    if (session.role !== 'ADMIN' && session.role !== 'PHARMACIST') {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    const body = await request.json()
    const { medicationId, quantity, reason } = body
    const qty = parseInt(quantity)

    if (!medicationId || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { error: 'medicationId et quantity (>0) requis' },
        { status: 400 }
      )
    }

    const medication = await prisma.medication.findFirst({
      where: { id: medicationId, pharmacyId: session.pharmacyId, isActive: true },
    })

    if (!medication) {
      return NextResponse.json({ error: 'Medicament introuvable' }, { status: 404 })
    }

    const warehouseQty = medication.quantity - medication.shelfQuantity
    if (qty > warehouseQty) {
      return NextResponse.json(
        { error: `Stock insuffisant en magasin (disponible: ${warehouseQty})` },
        { status: 400 }
      )
    }

    const reference = generateRef('TRF')

    const [movement, updated] = await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          medicationId,
          pharmacyId: session.pharmacyId,
          type: 'TRANSFER',
          quantity: qty,
          location: 'shelf',
          reason: reason || 'Transfert magasin -> rayon',
          reference,
        },
      }),
      prisma.medication.update({
        where: { id: medicationId },
        data: { shelfQuantity: { increment: qty } },
      }),
    ])

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'STOCK_TRANSFER',
      entity: 'stock_movement',
      entityId: movement.id,
      details: JSON.stringify({
        medicationId,
        medicationName: medication.name,
        quantity: qty,
        from: 'warehouse',
        to: 'shelf',
        reference,
      }),
    })

    return NextResponse.json({
      movement,
      quantity: updated.quantity,
      shelfQuantity: updated.shelfQuantity,
      warehouseQuantity: updated.quantity - updated.shelfQuantity,
    }, { status: 201 })
  } catch (error) {
    console.error('Stock transfer error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
