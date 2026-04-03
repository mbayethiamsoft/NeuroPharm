import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const [inventories, total] = await Promise.all([
      prisma.inventory.findMany({
        where: { pharmacyId: session.pharmacyId },
        include: {
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.inventory.count({
        where: { pharmacyId: session.pharmacyId },
      }),
    ])

    return NextResponse.json({
      inventories,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Inventory GET error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const body = await request.json()
    const { name } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Le nom de l\'inventaire est requis' },
        { status: 400 }
      )
    }

    // Get all active medications for the pharmacy
    const medications = await prisma.medication.findMany({
      where: {
        pharmacyId: session.pharmacyId,
        isActive: true,
      },
      select: { id: true, quantity: true },
    })

    // Create inventory with pre-filled items
    const inventory = await prisma.inventory.create({
      data: {
        pharmacyId: session.pharmacyId,
        name,
        status: 'draft',
        startedAt: new Date(),
        items: {
          create: medications.map((med) => ({
            medicationId: med.id,
            expectedQty: med.quantity,
          })),
        },
      },
      include: {
        _count: { select: { items: true } },
      },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'CREATE',
      entity: 'inventory',
      entityId: inventory.id,
      details: JSON.stringify({
        name,
        itemCount: medications.length,
      }),
    })

    return NextResponse.json({ inventory }, { status: 201 })
  } catch (error) {
    console.error('Inventory POST error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
