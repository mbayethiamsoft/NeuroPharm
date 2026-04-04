import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (session?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const now = new Date()
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

    // Run all queries in parallel
    const [
      totalPharmacies,
      activePharmacies,
      totalUsers,
      activeUsers,
      subscriptions,
      thisMonthPayments,
      lastMonthPayments,
      thisMonthRegistrations,
      lastMonthRegistrations,
      recentLogs,
      ticketCount,
    ] = await Promise.all([
      prisma.pharmacy.count(),
      prisma.pharmacy.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
      prisma.user.count({ where: { isActive: true, role: { not: 'SUPER_ADMIN' } } }),
      prisma.subscription.findMany({
        include: { pharmacy: { select: { name: true, isActive: true } } },
      }),
      prisma.payment.findMany({
        where: { createdAt: { gte: thisMonth }, status: 'completed' },
      }),
      prisma.payment.findMany({
        where: { createdAt: { gte: lastMonth, lt: lastMonthEnd }, status: 'completed' },
      }),
      prisma.pharmacy.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.pharmacy.count({ where: { createdAt: { gte: lastMonth, lt: lastMonthEnd } } }),
      prisma.systemLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.supportTicket.count({ where: { status: 'open' } }),
    ])

    // Calculate MRR (Monthly Recurring Revenue)
    const mrrThisMonth = thisMonthPayments.reduce((sum, p) => sum + p.amount, 0)
    const mrrLastMonth = lastMonthPayments.reduce((sum, p) => sum + p.amount, 0)

    // Subscription stats
    const activeSubs = subscriptions.filter(s => s.status === 'ACTIVE').length
    const expiredSubs = subscriptions.filter(s => s.status === 'EXPIRED').length
    const suspendedSubs = subscriptions.filter(s => s.status === 'SUSPENDED').length
    const cancelledSubs = subscriptions.filter(s => s.status === 'CANCELLED').length

    // Plan distribution
    const planDistribution = {
      TRIAL: subscriptions.filter(s => s.plan === 'TRIAL').length,
      BASIC: subscriptions.filter(s => s.plan === 'BASIC').length,
      PROFESSIONAL: subscriptions.filter(s => s.plan === 'PROFESSIONAL').length,
      ENTERPRISE: subscriptions.filter(s => s.plan === 'ENTERPRISE').length,
    }

    // Churn rate: cancelled+expired this month / total active at start
    const churned = subscriptions.filter(
      s => (s.status === 'CANCELLED' || s.status === 'EXPIRED')
    ).length
    const churnRate = totalPharmacies > 0 ? ((churned / totalPharmacies) * 100).toFixed(1) : '0'

    // Conversion rate: active paid / total (non-trial)
    const paidSubs = subscriptions.filter(s => s.plan !== 'TRIAL' && s.status === 'ACTIVE').length
    const conversionRate = totalPharmacies > 0 ? ((paidSubs / totalPharmacies) * 100).toFixed(1) : '0'

    // Monthly growth
    const growthRate = lastMonthRegistrations > 0
      ? (((thisMonthRegistrations - lastMonthRegistrations) / lastMonthRegistrations) * 100).toFixed(1)
      : thisMonthRegistrations > 0 ? '100' : '0'

    return NextResponse.json({
      kpis: {
        totalPharmacies,
        activePharmacies,
        totalUsers,
        activeUsers,
        mrrThisMonth,
        mrrLastMonth,
        mrrGrowth: mrrLastMonth > 0
          ? (((mrrThisMonth - mrrLastMonth) / mrrLastMonth) * 100).toFixed(1)
          : '0',
        activeSubs,
        expiredSubs,
        suspendedSubs,
        cancelledSubs,
        planDistribution,
        churnRate,
        conversionRate,
        growthRate,
        thisMonthRegistrations,
        openTickets: ticketCount,
      },
      recentLogs,
    })
  } catch (error) {
    console.error('SuperAdmin dashboard:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
