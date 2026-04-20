import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSuperAdminSession } from '@/lib/auth'
import { createSystemLog } from '@/lib/system-log'

function generateReference() {
  const now = new Date()
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let rand = ''
  for (let i = 0; i < 6; i++) rand += chars[Math.floor(Math.random() * chars.length)]
  return `NP-${date}-${rand}`
}

const VALID_METHODS = ['mobile_money', 'cash', 'bank_transfer', 'check']

export async function POST(request: NextRequest) {
  try {
    const session = await getSuperAdminSession()
    if (session?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { subscriptionId, amount, method, provider, reference, notes, period } = await request.json()

    if (!subscriptionId || !amount || !method) {
      return NextResponse.json({ error: 'subscriptionId, amount et method requis' }, { status: 400 })
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Le montant doit être un nombre positif' }, { status: 400 })
    }
    if (!VALID_METHODS.includes(method)) {
      return NextResponse.json({ error: 'Méthode invalide' }, { status: 400 })
    }
    const isAnnual = period === 'annual'
    const days = isAnnual ? 365 : 30
    const periodLabel = isAnnual ? 'annuel' : 'mensuel'

    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { pharmacy: { select: { id: true, name: true } } },
    })
    if (!sub) {
      return NextResponse.json({ error: 'Abonnement non trouvé' }, { status: 404 })
    }

    const finalReference = reference || generateReference()
    const currentEnd = sub.endDate || new Date()
    const newEnd = new Date(Math.max(currentEnd.getTime(), Date.now()) + days * 24 * 60 * 60 * 1000)

    const [payment] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          subscriptionId,
          amount,
          method,
          provider: provider || null,
          reference: finalReference,
          notes: notes || null,
          recordedBy: session.email,
          type: 'manual',
          status: 'completed',
          paidAt: new Date(),
        },
      }),
      prisma.subscription.update({
        where: { id: subscriptionId },
        data: { endDate: newEnd, status: 'ACTIVE' },
      }),
    ])

    await Promise.all([
      createSystemLog({
        action: 'MANUAL_PAYMENT',
        userId: session.id,
        userEmail: session.email,
        targetId: subscriptionId,
        targetType: 'subscription',
        details: `${sub.pharmacy.name}: paiement ${periodLabel} de ${amount} XOF (${method}) ref:${finalReference} — expire le ${newEnd.toLocaleDateString('fr-FR')} — enregistré par ${session.email}`,
      }),
      prisma.notification.create({
        data: {
          pharmacyId: sub.pharmacy.id,
          title: 'Paiement d\'abonnement confirmé',
          message: `Votre paiement ${periodLabel} de ${new Intl.NumberFormat('fr-FR').format(amount)} XOF a été enregistré (réf. ${finalReference}). Abonnement actif jusqu'au ${newEnd.toLocaleDateString('fr-FR')}.`,
          type: 'payment',
          severity: 'info',
          link: '/dashboard/settings',
        },
      }),
    ])

    return NextResponse.json({ success: true, payment, newEndDate: newEnd }, { status: 201 })
  } catch (error) {
    console.error('SuperAdmin payments POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
