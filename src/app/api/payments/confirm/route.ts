import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSystemLog } from '@/lib/system-log'

// Vérifie le statut d'un paiement sans le confirmer (utilisé par le polling côté client en production)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionToken = searchParams.get('session')

    if (!sessionToken || typeof sessionToken !== 'string') {
      return NextResponse.json({ error: 'session requis' }, { status: 400 })
    }

    const payment = await prisma.payment.findUnique({
      where: { sessionToken },
      select: {
        status: true,
        reference: true,
        paidAt: true,
        period: true,
        amount: true,
        expiresAt: true,
        subscription: { select: { endDate: true } },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
    }

    return NextResponse.json({
      status: payment.status,
      reference: payment.reference,
      paidAt: payment.paidAt,
      period: payment.period,
      amount: payment.amount,
      expiresAt: payment.expiresAt,
      newEndDate: payment.subscription?.endDate ?? null,
    })
  } catch (error) {
    console.error('Payments confirm GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sessionToken } = await request.json()

    if (!sessionToken || typeof sessionToken !== 'string') {
      return NextResponse.json({ error: 'sessionToken requis' }, { status: 400 })
    }

    const payment = await prisma.payment.findUnique({
      where: { sessionToken },
      include: {
        subscription: {
          include: {
            pharmacy: { select: { id: true, name: true } },
          },
        },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })
    }
    if (payment.status === 'completed') {
      return NextResponse.json({ error: 'Paiement déjà effectué' }, { status: 409 })
    }
    if (payment.status === 'failed') {
      return NextResponse.json({ error: 'Session expirée ou annulée' }, { status: 410 })
    }
    if (payment.expiresAt && new Date() > payment.expiresAt) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } })
      return NextResponse.json({ error: 'QR code expiré' }, { status: 410 })
    }

    const sub = payment.subscription
    const days = payment.period === 'annual' ? 365 : 30
    const periodLabel = payment.period === 'annual' ? 'annuel' : 'mensuel'

    const currentEnd = sub.endDate || new Date()
    const newEnd = new Date(Math.max(currentEnd.getTime(), Date.now()) + days * 24 * 60 * 60 * 1000)

    // Mettre à jour paiement + abonnement en transaction
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'completed', paidAt: new Date() },
      }),
      prisma.subscription.update({
        where: { id: sub.id },
        data: { endDate: newEnd, status: 'ACTIVE' },
      }),
    ])

    const amountFormatted = new Intl.NumberFormat('fr-FR').format(payment.amount)

    // Notification pour l'admin de la pharmacie
    await prisma.notification.create({
      data: {
        pharmacyId: sub.pharmacy.id,
        title: 'Paiement Wave confirmé',
        message: `Votre abonnement ${periodLabel} de ${amountFormatted} XOF a été payé via Wave (réf. ${payment.reference}). Abonnement actif jusqu'au ${newEnd.toLocaleDateString('fr-FR')}.`,
        type: 'payment',
        severity: 'info',
        link: '/dashboard/parametres',
      },
    })

    // Log système visible par le SuperAdmin
    await createSystemLog({
      level: 'info',
      action: 'PAYMENT_COMPLETED',
      targetId: sub.id,
      targetType: 'subscription',
      details: `${sub.pharmacy.name}: paiement Wave ${periodLabel} — ${amountFormatted} XOF — réf: ${payment.reference} — expire le ${newEnd.toLocaleDateString('fr-FR')}`,
    })

    return NextResponse.json({
      success: true,
      reference: payment.reference,
      amount: payment.amount,
      period: payment.period,
      newEndDate: newEnd.toISOString(),
      pharmacyName: sub.pharmacy.name,
    })
  } catch (error) {
    console.error('Payments confirm POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
