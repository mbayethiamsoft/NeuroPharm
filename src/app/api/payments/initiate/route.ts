import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { createSystemLog } from '@/lib/system-log'
import crypto from 'crypto'

const PLAN_AMOUNTS: Record<string, { monthly: number; annual: number }> = {
  TRIAL:        { monthly: 0,     annual: 0      },
  BASIC:        { monthly: 15000, annual: 150000  },
  PROFESSIONAL: { monthly: 35000, annual: 350000  },
  ENTERPRISE:   { monthly: 75000, annual: 0       },
}

function generateReference() {
  const now = new Date()
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let rand = ''
  for (let i = 0; i < 6; i++) rand += chars[Math.floor(Math.random() * chars.length)]
  return `NP-${date}-${rand}`
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }
    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { period, method } = await request.json()

    if (!period || !['monthly', 'annual'].includes(period)) {
      return NextResponse.json({ error: 'Période invalide (monthly | annual)' }, { status: 400 })
    }
    if (method !== 'wave') {
      return NextResponse.json({ error: 'Seul Wave est disponible pour le moment' }, { status: 400 })
    }

    const subscription = await prisma.subscription.findUnique({
      where: { pharmacyId: session.pharmacyId },
      include: { pharmacy: { select: { id: true, name: true, email: true } } },
    })
    if (!subscription) {
      return NextResponse.json({ error: 'Aucun abonnement trouvé' }, { status: 404 })
    }

    const plan = subscription.plan
    const amounts = PLAN_AMOUNTS[plan]
    if (!amounts) {
      return NextResponse.json({ error: 'Plan inconnu' }, { status: 400 })
    }
    const amount = period === 'annual' ? amounts.annual : amounts.monthly
    if (amount === 0) {
      return NextResponse.json({ error: 'Ce plan ne nécessite pas de paiement' }, { status: 400 })
    }

    // Expire tout token en attente pour cette souscription
    await prisma.payment.updateMany({
      where: {
        subscriptionId: subscription.id,
        status: 'pending',
        sessionToken: { not: null },
      },
      data: { status: 'failed' },
    })

    const sessionToken = crypto.randomBytes(32).toString('hex')
    const expiryMinutes = parseInt(process.env.WAVE_QR_EXPIRY_MINUTES || '10', 10)
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000)
    const reference = generateReference()

    // URL Wave simulée — en prod, appeler l'API Wave pour générer un checkout URL
    const waveMerchantId = process.env.WAVE_MERCHANT_ID || 'merchant_neuropharm_sn_001'
    const waveCheckoutBase = process.env.WAVE_CHECKOUT_URL || 'https://pay.wave.com/m/neuropharm/c/'
    const waveUrl = `${waveCheckoutBase}?amount=${amount}&currency=XOF&ref=${reference}&merchant=${waveMerchantId}`

    const payment = await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        amount,
        method: 'mobile_money',
        provider: 'wave',
        reference,
        status: 'pending',
        period,
        sessionToken,
        expiresAt,
        type: 'pharmacy_initiated',
      },
    })

    await createSystemLog({
      level: 'info',
      action: 'PAYMENT_INITIATED',
      userId: session.id,
      userEmail: session.email,
      targetId: subscription.id,
      targetType: 'subscription',
      details: `${subscription.pharmacy.name}: initiation paiement ${period} — ${amount} XOF via Wave — réf: ${reference}`,
    })

    return NextResponse.json({
      sessionToken,
      reference,
      amount,
      period,
      plan,
      pharmacyName: subscription.pharmacy.name,
      waveUrl,
      expiresAt: expiresAt.toISOString(),
      paymentId: payment.id,
    }, { status: 201 })
  } catch (error) {
    console.error('Payments initiate POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
