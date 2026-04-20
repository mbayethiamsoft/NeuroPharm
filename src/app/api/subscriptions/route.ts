import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { createSystemLog } from '@/lib/system-log'

const VALID_PLANS = ['TRIAL', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE']

const PLAN_AMOUNTS: Record<string, number> = {
  TRIAL: 0,
  BASIC: 15000,
  PROFESSIONAL: 35000,
  ENTERPRISE: 75000,
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const subscription = await prisma.subscription.findUnique({
      where: { pharmacyId: session.pharmacyId },
    })

    return NextResponse.json({ subscription })
  } catch (error) {
    console.error('Subscriptions GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }
    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { plan } = await request.json()

    if (!plan || !VALID_PLANS.includes(plan)) {
      return NextResponse.json({ error: 'Plan invalide' }, { status: 400 })
    }

    const subscription = await prisma.subscription.findUnique({
      where: { pharmacyId: session.pharmacyId },
      include: { pharmacy: { select: { name: true } } },
    })

    if (!subscription) {
      return NextResponse.json({ error: 'Aucun abonnement trouvé' }, { status: 404 })
    }

    if (subscription.plan === plan) {
      return NextResponse.json({ error: 'Vous êtes déjà sur ce plan' }, { status: 400 })
    }

    const previousPlan = subscription.plan

    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        plan,
        amount: PLAN_AMOUNTS[plan] ?? 0,
      },
    })

    await createSystemLog({
      action: 'SUBSCRIPTION_PLAN_CHANGED',
      userId: session.id,
      userEmail: session.email,
      targetId: subscription.id,
      targetType: 'subscription',
      details: `${subscription.pharmacy.name}: ${previousPlan} → ${plan}`,
    })

    return NextResponse.json({ subscription: updated })
  } catch (error) {
    console.error('Subscriptions PATCH:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
