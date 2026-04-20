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
    const location = searchParams.get('location') // 'warehouse' | 'shelf' | null

    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

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

    // Compute status + warehouseQuantity
    const enriched = medications.map((med) => {
      const warehouseQuantity = med.quantity - med.shelfQuantity
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

      return { ...med, warehouseQuantity, status }
    })

    // Filter based on alert / location
    let filtered = enriched
    if (alert === 'low') {
      filtered = filtered.filter((m) => m.status === 'low' || m.status === 'critical')
    } else if (alert === 'expiring') {
      filtered = filtered.filter((m) => m.status === 'expiring' || m.status === 'expired')
    }
    if (location === 'warehouse') {
      filtered = filtered.filter((m) => m.warehouseQuantity > 0)
    } else if (location === 'shelf') {
      filtered = filtered.filter((m) => m.shelfQuantity > 0)
    }

    // Stats
    const totalProducts = medications.length
    const lowStock = enriched.filter((m) => m.status === 'low' || m.status === 'critical').length
    const expiringSoon = enriched.filter((m) => m.status === 'expiring' || m.status === 'expired').length
    const totalWarehouse = enriched.reduce((sum, m) => sum + m.warehouseQuantity, 0)
    const totalShelf = enriched.reduce((sum, m) => sum + m.shelfQuantity, 0)
    const awaitingTransfer = enriched.filter((m) => m.warehouseQuantity > 0 && m.shelfQuantity === 0).length

    return NextResponse.json({
      medications: filtered,
      stats: {
        totalProducts,
        lowStock,
        expiringSoon,
        totalWarehouse,
        totalShelf,
        awaitingTransfer,
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
    const rawLocation = body.location
    const location: 'warehouse' | 'shelf' =
      rawLocation === 'shelf' ? 'shelf' : 'warehouse'

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

    const medication = await prisma.medication.findFirst({
      where: { id: medicationId, pharmacyId: session.pharmacyId },
    })

    if (!medication) {
      return NextResponse.json(
        { error: 'Medicament non trouve' },
        { status: 404 }
      )
    }

    const absQty = Math.abs(parseInt(quantity))
    const warehouseQty = medication.quantity - medication.shelfQuantity

    let newQuantity = medication.quantity
    let newShelfQuantity = medication.shelfQuantity

    switch (type) {
      case 'IN':
      case 'RETURN':
        newQuantity += absQty
        if (location === 'shelf') newShelfQuantity += absQty
        break
      case 'OUT':
      case 'EXPIRED':
        if (location === 'shelf') {
          if (medication.shelfQuantity < absQty) {
            return NextResponse.json(
              { error: `Stock en rayon insuffisant (disponible: ${medication.shelfQuantity})` },
              { status: 400 }
            )
          }
          newShelfQuantity -= absQty
        } else {
          if (warehouseQty < absQty) {
            return NextResponse.json(
              { error: `Stock en magasin insuffisant (disponible: ${warehouseQty})` },
              { status: 400 }
            )
          }
        }
        newQuantity -= absQty
        break
      case 'ADJUSTMENT': {
        const delta = parseInt(quantity) // may be negative
        newQuantity += delta
        if (location === 'shelf') newShelfQuantity += delta
        if (newQuantity < 0) {
          return NextResponse.json(
            { error: "L'ajustement rendrait le stock total negatif" },
            { status: 400 }
          )
        }
        if (newShelfQuantity < 0) {
          return NextResponse.json(
            { error: "L'ajustement rendrait le stock en rayon negatif" },
            { status: 400 }
          )
        }
        if (newShelfQuantity > newQuantity) {
          return NextResponse.json(
            { error: "Stock en rayon superieur au total — ajuster le magasin d'abord" },
            { status: 400 }
          )
        }
        break
      }
    }

    const reference = generateRef('MVT')

    const [movement] = await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          medicationId,
          pharmacyId: session.pharmacyId,
          type,
          quantity: type === 'ADJUSTMENT' ? parseInt(quantity) : absQty,
          location,
          reason: reason || null,
          reference,
        },
        include: {
          medication: { select: { name: true } },
        },
      }),
      prisma.medication.update({
        where: { id: medicationId },
        data: { quantity: newQuantity, shelfQuantity: newShelfQuantity },
      }),
    ])

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
        location,
        quantity,
        previousStock: medication.quantity,
        previousShelf: medication.shelfQuantity,
        newStock: newQuantity,
        newShelf: newShelfQuantity,
        reason,
        reference,
      }),
    })

    return NextResponse.json(
      { movement, newQuantity, newShelfQuantity, warehouseQuantity: newQuantity - newShelfQuantity },
      { status: 201 }
    )
  } catch (error) {
    console.error('Stock POST error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
