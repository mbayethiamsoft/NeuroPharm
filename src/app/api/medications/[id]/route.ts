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
        quantity: parseInt(body.quantity) || 0,
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
