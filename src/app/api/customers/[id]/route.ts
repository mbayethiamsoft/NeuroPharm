import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

async function loadCustomerWithBalance(id: string, pharmacyId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, pharmacyId },
  })
  if (!customer) return null

  const [sales, payments] = await Promise.all([
    prisma.sale.findMany({
      where: {
        customerId: id,
        pharmacyId,
        paymentMethod: 'CREDIT',
        status: { not: 'cancelled' },
      },
      include: {
        items: { include: { medication: { select: { id: true, name: true } } } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.creditPayment.findMany({
      where: { customerId: id, pharmacyId },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const totalDebt = sales.reduce((sum, s) => sum + s.total, 0)
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const balance = totalDebt - totalPaid

  return { customer, sales, payments, totalDebt, totalPaid, balance }
}

// GET /api/customers/[id] — customer detail with credit sales + payments + balance
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }
    const { id } = await params

    const data = await loadCustomerWithBalance(id, session.pharmacyId)
    if (!data) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching customer:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PUT /api/customers/[id] — update customer
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

    const existing = await prisma.customer.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    const body = await request.json()
    const fullName = body.fullName !== undefined ? String(body.fullName).trim() : existing.fullName
    const phone = body.phone !== undefined ? (String(body.phone).trim() || null) : existing.phone
    const address = body.address !== undefined ? (String(body.address).trim() || null) : existing.address
    const notes = body.notes !== undefined ? (String(body.notes).trim() || null) : existing.notes
    const creditLimit =
      body.creditLimit !== undefined ? Number(body.creditLimit) : existing.creditLimit

    if (!fullName) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    }
    if (creditLimit < 0) {
      return NextResponse.json({ error: 'Plafond invalide' }, { status: 400 })
    }

    if (phone && phone !== existing.phone) {
      const duplicate = await prisma.customer.findFirst({
        where: { pharmacyId: session.pharmacyId, phone, NOT: { id } },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: 'Un client avec ce téléphone existe déjà' },
          { status: 409 }
        )
      }
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: { fullName, phone, address, notes, creditLimit },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'UPDATE',
      entity: 'customer',
      entityId: id,
      details: JSON.stringify({ fullName, phone, creditLimit }),
    })

    return NextResponse.json({ customer })
  } catch (error) {
    console.error('Error updating customer:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// DELETE /api/customers/[id] — soft delete (isActive=false)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }
    const { id } = await params

    const existing = await prisma.customer.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    await prisma.customer.update({
      where: { id },
      data: { isActive: false },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'DELETE',
      entity: 'customer',
      entityId: id,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting customer:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
