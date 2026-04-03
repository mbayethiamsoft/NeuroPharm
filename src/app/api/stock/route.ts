import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'
import { generateRef } from '@/lib/utils'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const alert = searchParams.get('alert')
    const search = searchParams.get('search')

    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
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

    if (alert === 'low') {
      where.quantity = { lte: prisma.medication.fields.minStock }
      // Use raw comparison: quantity <= minStock
    } else if (alert === 'expiring') {
      where.expiryDate = { lte: thirtyDaysFromNow, gte: now }
    }

    // Fetch all medications for the pharmacy
    const medications = await prisma.medication.findMany({
      where: {
        pharmacyId: session.pharmacyId,
        isActive: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { genericName: { contains: search, mode: 'insensitive' } },
                { barcode: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        category: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    })

    // Compute status and filter based on alert
    const enriched = medications.map((med) => {
      let status: 'ok' | 'low' | 'critical' | 'expired' | 'expiring' = 'ok'

      if (med.quantity <= 0) {
        status = 'critical'
      } else if (med.quantity <= med.minStock) {
        status = 'low'
      }

      if (med.expiryDate) {
        if (med.expiryDate <= now) {
          status = 'expired'
        } else if (med.expiryDate <= thirtyDaysFromNow && status === 'ok') {
          status = 'expiring'
        }
      }

      return { ...med, status }
    })

    // Filter based on alert type
    let filtered = enriched
    if (alert === 'low') {
      filtered = enriched.filter((m) => m.status === 'low' || m.status === 'critical')
    } else if (alert === 'expiring') {
      filtered = enriched.filter((m) => m.status === 'expiring' || m.status === 'expired')
    }

    // Stats
    const totalProducts = medications.length
    const lowStock = enriched.filter((m) => m.status === 'low' || m.status === 'critical').length
    const expiringSoon = enriched.filter((m) => m.status === 'expiring' || m.status === 'expired').length

    return NextResponse.json({
      medications: filtered,
      stats: {
        totalProducts,
        lowStock,
        expiringSoon,
      },
    })
  } catch (error) {
    console.error('Stock GET error:', error)
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
    const { medicationId, type, quantity, reason } = body

    if (!medicationId || !type || !quantity) {
      return NextResponse.json(
        { error: 'Champs requis: medicationId, type, quantity' },
        { status: 400 }
      )
    }

    const validTypes = ['IN', 'OUT', 'ADJUSTMENT', 'RETURN', 'EXPIRED']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Type de mouvement invalide' },
        { status: 400 }
      )
    }

    // Verify medication belongs to the pharmacy
    const medication = await prisma.medication.findFirst({
      where: { id: medicationId, pharmacyId: session.pharmacyId },
    })

    if (!medication) {
      return NextResponse.json(
        { error: 'Medicament non trouve' },
        { status: 404 }
      )
    }

    // Calculate new quantity
    let newQuantity = medication.quantity
    const absQty = Math.abs(quantity)

    switch (type) {
      case 'IN':
      case 'RETURN':
        newQuantity += absQty
        break
      case 'OUT':
      case 'EXPIRED':
        newQuantity -= absQty
        if (newQuantity < 0) {
          return NextResponse.json(
            { error: 'Stock insuffisant' },
            { status: 400 }
          )
        }
        break
      case 'ADJUSTMENT':
        // Quantity can be positive or negative for adjustments
        newQuantity += quantity
        if (newQuantity < 0) {
          return NextResponse.json(
            { error: 'L\'ajustement rendrait le stock negatif' },
            { status: 400 }
          )
        }
        break
    }

    const reference = generateRef('MVT')

    // Transaction: create movement + update stock
    const [movement] = await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          medicationId,
          pharmacyId: session.pharmacyId,
          type,
          quantity: type === 'ADJUSTMENT' ? quantity : absQty,
          reason: reason || null,
          reference,
        },
        include: {
          medication: { select: { name: true } },
        },
      }),
      prisma.medication.update({
        where: { id: medicationId },
        data: { quantity: newQuantity },
      }),
    ])

    // Audit log
    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'STOCK_MOVEMENT',
      entity: 'stock_movement',
      entityId: movement.id,
      details: JSON.stringify({
        medicationId,
        medicationName: medication.name,
        type,
        quantity,
        previousStock: medication.quantity,
        newStock: newQuantity,
        reason,
        reference,
      }),
    })

    return NextResponse.json({ movement, newQuantity }, { status: 201 })
  } catch (error) {
    console.error('Stock POST error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
