import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

// GET /api/customers — list customers with aggregated credit balance
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim() || ''
    const filter = searchParams.get('filter') || '' // '', 'inDebt', 'settled'
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: Record<string, unknown> = {
      pharmacyId: session.pharmacyId,
      isActive: true,
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ]
    }

    const customers = await prisma.customer.findMany({
      where: where as never,
      orderBy: { fullName: 'asc' },
      skip: offset,
      take: limit,
    })

    const dateRange: { gte?: Date; lte?: Date } = {}
    if (dateFrom) {
      const f = new Date(dateFrom)
      f.setHours(0, 0, 0, 0)
      dateRange.gte = f
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      dateRange.lte = to
    }

    const customerIds = customers.map((c) => c.id)
    const [saleAggs, paymentAggs] = await Promise.all([
      prisma.sale.groupBy({
        by: ['customerId'],
        where: {
          customerId: { in: customerIds },
          pharmacyId: session.pharmacyId,
          paymentMethod: 'CREDIT',
          status: { not: 'cancelled' },
          ...(dateRange.gte || dateRange.lte ? { createdAt: dateRange } : {}),
        },
        _sum: { total: true },
      }),
      prisma.creditPayment.groupBy({
        by: ['customerId'],
        where: {
          customerId: { in: customerIds },
          pharmacyId: session.pharmacyId,
          ...(dateRange.gte || dateRange.lte ? { createdAt: dateRange } : {}),
        },
        _sum: { amount: true },
      }),
    ])

    const debtByCustomer = new Map(saleAggs.map((a) => [a.customerId, a._sum.total || 0]))
    const paidByCustomer = new Map(paymentAggs.map((a) => [a.customerId, a._sum.amount || 0]))

    let rows = customers.map((c) => {
      const totalDebt = debtByCustomer.get(c.id) || 0
      const totalPaid = paidByCustomer.get(c.id) || 0
      const balance = totalDebt - totalPaid
      return {
        id: c.id,
        fullName: c.fullName,
        phone: c.phone,
        address: c.address,
        notes: c.notes,
        creditLimit: c.creditLimit,
        isActive: c.isActive,
        createdAt: c.createdAt,
        totalDebt,
        totalPaid,
        balance,
      }
    })

    if (filter === 'inDebt') rows = rows.filter((r) => r.balance > 0.009)
    if (filter === 'settled') rows = rows.filter((r) => r.balance <= 0.009)

    const totals = rows.reduce(
      (acc, r) => {
        acc.totalDebt += r.totalDebt
        acc.totalPaid += r.totalPaid
        acc.balance += r.balance
        if (r.balance > 0.009) acc.inDebtCount += 1
        return acc
      },
      { totalDebt: 0, totalPaid: 0, balance: 0, inDebtCount: 0 }
    )

    return NextResponse.json({
      customers: rows,
      totals: { ...totals, totalCount: rows.length },
    })
  } catch (error) {
    console.error('Error fetching customers:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/customers — create customer
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const body = await request.json()
    const fullName = (body.fullName || '').trim()
    const phone = (body.phone || '').trim() || null
    const address = (body.address || '').trim() || null
    const notes = (body.notes || '').trim() || null
    const creditLimit = Number(body.creditLimit) || 0

    if (!fullName) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    }
    if (creditLimit < 0) {
      return NextResponse.json({ error: 'Plafond invalide' }, { status: 400 })
    }

    if (phone) {
      const existing = await prisma.customer.findFirst({
        where: { pharmacyId: session.pharmacyId, phone },
      })
      if (existing) {
        return NextResponse.json(
          { error: 'Un client avec ce téléphone existe déjà' },
          { status: 409 }
        )
      }
    }

    const customer = await prisma.customer.create({
      data: {
        pharmacyId: session.pharmacyId,
        fullName,
        phone,
        address,
        notes,
        creditLimit,
      },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'CREATE',
      entity: 'customer',
      entityId: customer.id,
      details: JSON.stringify({ fullName, phone, creditLimit }),
    })

    return NextResponse.json({ customer }, { status: 201 })
  } catch (error) {
    console.error('Error creating customer:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
