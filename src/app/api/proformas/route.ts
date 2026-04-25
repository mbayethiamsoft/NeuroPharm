import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

// GET /api/proformas - Liste paginée des devis
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
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
        { id: { endsWith: search.toLowerCase() } },
      ]
    }

    const [proformas, total] = await Promise.all([
      prisma.proforma.findMany({
        where: where as never,
        include: {
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.proforma.count({ where: where as never }),
    ])

    return NextResponse.json({
      proformas,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching proformas:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des devis' },
      { status: 500 }
    )
  }
}

// POST /api/proformas - Créer un nouveau devis
// ⚠ Aucune décrémentation de stock, aucun mouvement de stock, aucun AuditLog 'SALE'.
// Un devis est un document d'estimation sans valeur comptable.
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json()
    const {
      items,
      discountRate,
      customerName,
      customerPhone,
      validityDays,
      notes,
    } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Le devis doit contenir au moins un article' },
        { status: 400 }
      )
    }

    // Valider chaque item
    for (const it of items) {
      if (!it.medicationName || typeof it.medicationName !== 'string') {
        return NextResponse.json(
          { error: 'Chaque article doit avoir un nom' },
          { status: 400 }
        )
      }
      const qty = Number(it.quantity)
      const price = Number(it.unitPrice)
      if (!Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json(
          { error: `Quantité invalide pour "${it.medicationName}"` },
          { status: 400 }
        )
      }
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json(
          { error: `Prix invalide pour "${it.medicationName}"` },
          { status: 400 }
        )
      }
    }

    // Vérifier que les médicaments référencés appartiennent bien à la pharmacie (si fournis)
    const medIds = items
      .map((i: { medicationId?: string }) => i.medicationId)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    if (medIds.length > 0) {
      const count = await prisma.medication.count({
        where: { id: { in: medIds }, pharmacyId: session.pharmacyId },
      })
      if (count !== new Set(medIds).size) {
        return NextResponse.json(
          { error: 'Un ou plusieurs médicaments sont introuvables' },
          { status: 400 }
        )
      }
    }

    // Calculs côté serveur (autoritaire)
    const subtotal = items.reduce(
      (s: number, it: { quantity: number; unitPrice: number }) =>
        s + Number(it.quantity) * Number(it.unitPrice),
      0
    )
    const rate = Math.max(0, Math.min(100, Number(discountRate) || 0))
    const discount = Math.round((subtotal * rate) / 100)
    const total = Math.max(0, subtotal - discount)
    const validity = Math.max(0, Math.min(365, Number(validityDays) || 15))

    const proforma = await prisma.proforma.create({
      data: {
        pharmacyId: session.pharmacyId,
        userId: session.id,
        subtotal,
        discount,
        discountRate: rate,
        total,
        customerName: customerName ? String(customerName).trim() || null : null,
        customerPhone: customerPhone ? String(customerPhone).trim() || null : null,
        validityDays: validity,
        notes: notes ? String(notes).trim() || null : null,
        items: {
          create: items.map(
            (it: {
              medicationId?: string | null
              medicationName: string
              medicationRef?: string | null
              quantity: number
              unitPrice: number
            }) => ({
              medicationId: it.medicationId || null,
              medicationName: String(it.medicationName).trim(),
              medicationRef: it.medicationRef ? String(it.medicationRef).trim() : null,
              quantity: Number(it.quantity),
              unitPrice: Number(it.unitPrice),
              total: Number(it.quantity) * Number(it.unitPrice),
            })
          ),
        },
      },
      include: { items: true },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'CREATE',
      entity: 'proforma',
      entityId: proforma.id,
      details: JSON.stringify({
        total: proforma.total,
        itemCount: items.length,
      }),
    })

    return NextResponse.json({ proforma }, { status: 201 })
  } catch (error) {
    console.error('Error creating proforma:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création du devis' },
      { status: 500 }
    )
  }
}
