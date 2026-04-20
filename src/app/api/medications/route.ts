import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''

    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      pharmacyId: session.pharmacyId,
      isActive: true,
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { genericName: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (category) {
      where.categoryId = category
    }

    const [medications, total] = await Promise.all([
      prisma.medication.findMany({
        where,
        include: { category: true },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.medication.count({ where }),
    ])

    return NextResponse.json({
      medications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('GET /api/medications error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json()

    const {
      name,
      genericName,
      barcode,
      description,
      dosage,
      form,
      categoryId,
      purchasePrice,
      sellingPrice,
      quantity,
      minStock,
      expiryDate,
      location,
      requiresPrescription,
    } = body

    if (!name || sellingPrice === undefined || purchasePrice === undefined) {
      return NextResponse.json(
        { error: 'Le nom, le prix d\'achat et le prix de vente sont requis' },
        { status: 400 }
      )
    }

    const medication = await prisma.medication.create({
      data: {
        name,
        genericName: genericName || null,
        barcode: barcode || null,
        description: description || null,
        dosage: dosage || null,
        form: form || null,
        categoryId: categoryId || null,
        pharmacyId: session.pharmacyId,
        purchasePrice: parseFloat(purchasePrice) || 0,
        sellingPrice: parseFloat(sellingPrice) || 0,
        quantity: parseInt(quantity) || 0,
        shelfQuantity: 0, // new stock lands in warehouse; must be transferred to shelf before sale
        minStock: parseInt(minStock) || 10,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        location: location || null,
        requiresPrescription: requiresPrescription || false,
      },
      include: { category: true },
    })

    // Create initial stock movement if quantity > 0
    if (medication.quantity > 0) {
      await prisma.stockMovement.create({
        data: {
          medicationId: medication.id,
          pharmacyId: session.pharmacyId,
          type: 'IN',
          quantity: medication.quantity,
          location: 'warehouse',
          reason: 'Stock initial',
          unitPrice: medication.purchasePrice,
        },
      })
    }

    // Create audit log
    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'CREATE',
      entity: 'medication',
      entityId: medication.id,
      details: JSON.stringify({ name: medication.name, quantity: medication.quantity }),
    })

    return NextResponse.json(medication, { status: 201 })
  } catch (error) {
    console.error('POST /api/medications error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création du médicament' },
      { status: 500 }
    )
  }
}
