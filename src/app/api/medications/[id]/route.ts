import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await params

    const medication = await prisma.medication.findFirst({
      where: {
        id,
        pharmacyId: session.pharmacyId,
        isActive: true,
      },
      include: { category: true },
    })

    if (!medication) {
      return NextResponse.json(
        { error: 'Médicament non trouvé' },
        { status: 404 }
      )
    }

    return NextResponse.json(medication)
  } catch (error) {
    console.error('GET /api/medications/[id] error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await params

    // Verify medication belongs to pharmacy
    const existing = await prisma.medication.findFirst({
      where: {
        id,
        pharmacyId: session.pharmacyId,
        isActive: true,
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Médicament non trouvé' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const newQuantity = parseInt(body.quantity) || 0

    const medication = await prisma.medication.update({
      where: { id },
      data: {
        name: body.name,
        genericName: body.genericName || null,
        barcode: body.barcode || null,
        description: body.description || null,
        dosage: body.dosage || null,
        form: body.form || null,
        categoryId: body.categoryId || null,
        purchasePrice: parseFloat(body.purchasePrice) || 0,
        sellingPrice: parseFloat(body.sellingPrice) || 0,
        quantity: newQuantity,
        // Clamp shelfQuantity if total shrinks below it.
        ...(newQuantity < existing.shelfQuantity ? { shelfQuantity: newQuantity } : {}),
        minStock: parseInt(body.minStock) || 10,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        location: body.location || null,
        requiresPrescription: body.requiresPrescription || false,
      },
      include: { category: true },
    })

    // Create audit log
    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'UPDATE',
      entity: 'medication',
      entityId: medication.id,
      details: JSON.stringify({
        name: medication.name,
        changes: Object.keys(body).join(', '),
      }),
    })

    return NextResponse.json(medication)
  } catch (error) {
    console.error('PUT /api/medications/[id] error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await params

    const existing = await prisma.medication.findFirst({
      where: {
        id,
        pharmacyId: session.pharmacyId,
        isActive: true,
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Médicament non trouvé' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const ALLOWED = ['categoryId', 'sellingPrice', 'quantity', 'expiryDate'] as const
    const data: Record<string, unknown> = {}

    if ('categoryId' in body) {
      const categoryId = body.categoryId || null
      if (categoryId) {
        const category = await prisma.category.findFirst({
          where: { id: categoryId, pharmacyId: session.pharmacyId },
          select: { id: true },
        })
        if (!category) {
          return NextResponse.json(
            { error: 'Catégorie invalide' },
            { status: 400 }
          )
        }
      }
      data.categoryId = categoryId
    }
    if ('sellingPrice' in body) {
      const v = parseFloat(body.sellingPrice)
      if (Number.isNaN(v) || v < 0) {
        return NextResponse.json({ error: 'Prix de vente invalide' }, { status: 400 })
      }
      data.sellingPrice = v
    }
    if ('quantity' in body) {
      const v = parseInt(body.quantity)
      if (Number.isNaN(v) || v < 0) {
        return NextResponse.json({ error: 'Quantité invalide' }, { status: 400 })
      }
      data.quantity = v
      // If the new total drops below the shelf quantity, clamp the shelf to keep invariants.
      if (v < existing.shelfQuantity) {
        data.shelfQuantity = v
      }
    }
    if ('expiryDate' in body) {
      data.expiryDate = body.expiryDate ? new Date(body.expiryDate) : null
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'Aucun champ modifiable fourni' },
        { status: 400 }
      )
    }

    const medication = await prisma.medication.update({
      where: { id },
      data,
      include: { category: true },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'UPDATE',
      entity: 'medication',
      entityId: medication.id,
      details: JSON.stringify({
        name: medication.name,
        changes: Object.keys(body).filter(k => (ALLOWED as readonly string[]).includes(k)).join(', '),
      }),
    })

    return NextResponse.json(medication)
  } catch (error) {
    console.error('PATCH /api/medications/[id] error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { id } = await params

    // Verify medication belongs to pharmacy
    const existing = await prisma.medication.findFirst({
      where: {
        id,
        pharmacyId: session.pharmacyId,
        isActive: true,
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Médicament non trouvé' },
        { status: 404 }
      )
    }

    // Soft delete
    await prisma.medication.update({
      where: { id },
      data: { isActive: false },
    })

    // Create audit log
    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'DELETE',
      entity: 'medication',
      entityId: id,
      details: JSON.stringify({ name: existing.name }),
    })

    return NextResponse.json({ message: 'Médicament supprimé avec succès' })
  } catch (error) {
    console.error('DELETE /api/medications/[id] error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression' },
      { status: 500 }
    )
  }
}
