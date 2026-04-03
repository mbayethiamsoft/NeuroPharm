import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'
import { generateRef } from '@/lib/utils'

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
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search } },
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
      isPrescription,
    } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'La vente doit contenir au moins un article' },
        { status: 400 }
      )
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
      if (med.quantity < item.quantity) {
        return NextResponse.json(
          {
            error: `Stock insuffisant pour "${med.name}". Disponible: ${med.quantity}, Demande: ${item.quantity}`,
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
          subtotal: subtotal || 0,
          tax: tax || 0,
          discount: discount || 0,
          total: total || 0,
          paymentMethod: paymentMethod || 'CASH',
          customerName: customerName || null,
          customerPhone: customerPhone || null,
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

      // Deduct stock and create stock movements for each item
      const saleRef = generateRef('VNT')
      for (const item of items) {
        await tx.medication.update({
          where: { id: item.medicationId },
          data: {
            quantity: { decrement: item.quantity },
          },
        })

        await tx.stockMovement.create({
          data: {
            medicationId: item.medicationId,
            pharmacyId: session.pharmacyId!,
            type: 'OUT',
            quantity: item.quantity,
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
      }),
    })

    return NextResponse.json({ sale }, { status: 201 })
  } catch (error) {
    console.error('Error creating sale:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la creation de la vente' },
      { status: 500 }
    )
  }
}
