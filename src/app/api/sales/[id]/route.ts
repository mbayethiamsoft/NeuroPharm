import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

// GET /api/sales/[id] - Get single sale details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { id } = await params

    const sale = await prisma.sale.findFirst({
      where: {
        id,
        pharmacyId: session.pharmacyId,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        items: {
          include: {
            medication: {
              select: {
                id: true,
                name: true,
                genericName: true,
                barcode: true,
                form: true,
                dosage: true,
              },
            },
          },
        },
      },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Vente introuvable' }, { status: 404 })
    }

    return NextResponse.json({ sale })
  } catch (error) {
    console.error('Error fetching sale:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la recuperation de la vente' },
      { status: 500 }
    )
  }
}

// PUT /api/sales/[id] - Cancel or refund a sale
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { status } = body

    if (!status || !['cancelled', 'refunded'].includes(status)) {
      return NextResponse.json(
        { error: 'Statut invalide. Utilisez "cancelled" ou "refunded"' },
        { status: 400 }
      )
    }

    // Fetch the sale with items
    const sale = await prisma.sale.findFirst({
      where: {
        id,
        pharmacyId: session.pharmacyId,
      },
      include: { items: true },
    })

    if (!sale) {
      return NextResponse.json({ error: 'Vente introuvable' }, { status: 404 })
    }

    if (sale.status !== 'completed') {
      return NextResponse.json(
        { error: 'Seules les ventes completees peuvent etre annulees ou remboursees' },
        { status: 400 }
      )
    }

    // Revert stock and update sale in a transaction
    const updatedSale = await prisma.$transaction(async (tx) => {
      // Restore stock for each item
      for (const item of sale.items) {
        await tx.medication.update({
          where: { id: item.medicationId },
          data: {
            quantity: { increment: item.quantity },
          },
        })

        await tx.stockMovement.create({
          data: {
            medicationId: item.medicationId,
            pharmacyId: session.pharmacyId!,
            type: 'RETURN',
            quantity: item.quantity,
            reason: status === 'cancelled' ? 'Annulation de vente' : 'Remboursement',
            reference: sale.id,
            unitPrice: item.unitPrice,
          },
        })
      }

      // Update sale status
      return tx.sale.update({
        where: { id },
        data: { status },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
          items: {
            include: {
              medication: { select: { name: true } },
            },
          },
        },
      })
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: status === 'cancelled' ? 'CANCEL_SALE' : 'REFUND_SALE',
      entity: 'sale',
      entityId: sale.id,
      details: JSON.stringify({
        total: sale.total,
        previousStatus: sale.status,
        newStatus: status,
      }),
    })

    return NextResponse.json({ sale: updatedSale })
  } catch (error) {
    console.error('Error updating sale:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise a jour de la vente' },
      { status: 500 }
    )
  }
}
