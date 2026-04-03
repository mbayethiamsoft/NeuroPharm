import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const months = parseInt(searchParams.get('months') || '6')

    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - months)
    startDate.setDate(1)
    startDate.setHours(0, 0, 0, 0)

    const [salesAgg, expensesAgg, sales, expenses] = await Promise.all([
      prisma.sale.aggregate({
        where: { pharmacyId: session.pharmacyId, createdAt: { gte: startDate }, status: 'completed' },
        _sum: { total: true },
      }),
      prisma.expense.aggregate({
        where: { pharmacyId: session.pharmacyId, date: { gte: startDate } },
        _sum: { amount: true },
      }),
      prisma.sale.findMany({
        where: { pharmacyId: session.pharmacyId, createdAt: { gte: startDate }, status: 'completed' },
        select: { total: true, createdAt: true },
      }),
      prisma.expense.findMany({
        where: { pharmacyId: session.pharmacyId, date: { gte: startDate } },
        select: { amount: true, date: true },
      }),
    ])

    const totalRevenue = salesAgg._sum.total || 0
    const totalExpenses = expensesAgg._sum.amount || 0
    const netProfit = totalRevenue - totalExpenses
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

    // Monthly breakdown
    const monthlyData: Record<string, { revenue: number; expenses: number }> = {}
    for (const sale of sales) {
      const key = `${sale.createdAt.getFullYear()}-${String(sale.createdAt.getMonth() + 1).padStart(2, '0')}`
      if (!monthlyData[key]) monthlyData[key] = { revenue: 0, expenses: 0 }
      monthlyData[key].revenue += sale.total
    }
    for (const exp of expenses) {
      const key = `${exp.date.getFullYear()}-${String(exp.date.getMonth() + 1).padStart(2, '0')}`
      if (!monthlyData[key]) monthlyData[key] = { revenue: 0, expenses: 0 }
      monthlyData[key].expenses += exp.amount
    }

    const monthly = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data, profit: data.revenue - data.expenses }))

    return NextResponse.json({ totalRevenue, totalExpenses, netProfit, margin, monthly })
  } catch (error) {
    console.error('Accounting GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
