import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { createSystemLog } from '@/lib/system-log'

export async function GET() {
  try {
    const session = await getSession()
    if (session?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const subscriptions = await prisma.subscription.findMany({
      include: {
        pharmacy: { select: { id: true, name: true, isActive: true, city: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Payment history summary
    const allPayments = await prisma.payment.findMany({
      include: {
        subscription: {
          include: { pharmacy: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ subscriptions, recentPayments: allPayments })
  } catch (error) {
    console.error('SuperAdmin subscriptions GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    if (session?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { subscriptionId, action, plan, status: newStatus } = await request.json()

    if (!subscriptionId) {
      return NextResponse.json({ error: 'subscriptionId requis' }, { status: 400 })
    }

    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { pharmacy: { select: { name: true } } },
    })
    if (!sub) {
      return NextResponse.json({ error: 'Abonnement non trouvé' }, { status: 404 })
    }

    if (action === 'change_plan' && plan) {
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { plan },
      })
      await createSystemLog({
        action: 'SUBSCRIPTION_PLAN_CHANGED',
        userId: session.id,
        userEmail: session.email,
        targetId: subscriptionId,
        targetType: 'subscription',
        details: `${sub.pharmacy.name}: ${sub.plan} → ${plan}`,
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'change_status' && newStatus) {
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: newStatus },
      })
      await createSystemLog({
        action: 'SUBSCRIPTION_STATUS_CHANGED',
        userId: session.id,
        userEmail: session.email,
        targetId: subscriptionId,
        targetType: 'subscription',
        details: `${sub.pharmacy.name}: ${sub.status} → ${newStatus}`,
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'extend') {
      const days = 30
      const currentEnd = sub.endDate || new Date()
      const newEnd = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000)
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { endDate: newEnd, status: 'ACTIVE' },
      })
      await createSystemLog({
        action: 'SUBSCRIPTION_EXTENDED',
        userId: session.id,
        userEmail: session.email,
        targetId: subscriptionId,
        targetType: 'subscription',
        details: `${sub.pharmacy.name}: prolongé de ${days} jours`,
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 })
  } catch (error) {
    console.error('SuperAdmin subscriptions PUT:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
