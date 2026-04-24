import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

const METHODS = new Set(['CASH', 'MOBILE_MONEY', 'CARD'])

// POST /api/customers/[id]/payments — record a credit repayment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }
    const { id } = await params

    const customer = await prisma.customer.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!customer) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 })
    }

    const body = await request.json()
    const amount = Number(body.amount)
    const method = String(body.method || 'CASH').toUpperCase()
    const notes = body.notes ? String(body.notes).trim() : null

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 })
    }
    if (!METHODS.has(method)) {
      return NextResponse.json({ error: 'Mode de paiement invalide' }, { status: 400 })
    }

    // Current balance to prevent overpayment
    const [saleAgg, paymentAgg] = await Promise.all([
      prisma.sale.aggregate({
        where: {
          customerId: id,
          pharmacyId: session.pharmacyId,
          paymentMethod: 'CREDIT',
          status: { not: 'cancelled' },
        },
        _sum: { total: true },
      }),
      prisma.creditPayment.aggregate({
        where: { customerId: id, pharmacyId: session.pharmacyId },
        _sum: { amount: true },
      }),
    ])
    const totalDebt = saleAgg._sum.total || 0
    const totalPaid = paymentAgg._sum.amount || 0
    const balance = totalDebt - totalPaid

    if (amount > balance + 0.009) {
      return NextResponse.json(
        { error: `Le montant dépasse le solde dû (${balance.toFixed(0)} XOF)` },
        { status: 400 }
      )
    }

    const payment = await prisma.creditPayment.create({
      data: {
        pharmacyId: session.pharmacyId,
        customerId: id,
        amount,
        method,
        receivedBy: session.id,
        notes,
      },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'CREDIT_PAYMENT',
      entity: 'credit_payment',
      entityId: payment.id,
      details: JSON.stringify({
        customerId: id,
        customerName: customer.fullName,
        amount,
        method,
      }),
    })

    const newBalance = balance - amount

    return NextResponse.json(
      {
        payment,
        customer: { id: customer.id, fullName: customer.fullName, phone: customer.phone },
        balance: newBalance,
        previousBalance: balance,
        cashier: `${session.firstName || ''} ${session.lastName || ''}`.trim(),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error recording payment:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
