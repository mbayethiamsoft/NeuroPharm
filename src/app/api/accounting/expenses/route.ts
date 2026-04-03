import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const expenses = await prisma.expense.findMany({
      where: { pharmacyId: session.pharmacyId },
      orderBy: { date: 'desc' },
      take: 100,
    })
    return NextResponse.json({ expenses })
  } catch (error) {
    console.error('Expenses GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { category, description, amount, date } = await request.json()
    if (!category || !amount) return NextResponse.json({ error: 'Champs requis' }, { status: 400 })

    const expense = await prisma.expense.create({
      data: {
        pharmacyId: session.pharmacyId,
        category, description, amount: parseFloat(amount),
        date: date ? new Date(date) : new Date(),
      },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId, userId: session.id,
      action: 'CREATE', entity: 'expense', entityId: expense.id,
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error('Expenses POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
