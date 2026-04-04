import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

function generateReference() {
  const now = new Date()
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let rand = ''
  for (let i = 0; i < 6; i++) rand += chars[Math.floor(Math.random() * chars.length)]
  return `NP-${date}-${rand}`
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const subscription = await prisma.subscription.findUnique({
      where: { pharmacyId: session.pharmacyId },
    })
    if (!subscription) return NextResponse.json({ error: 'Aucun abonnement' }, { status: 404 })

    const payments = await prisma.payment.findMany({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ payments, subscription })
  } catch (error) {
    console.error('Payments GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { method, amount } = await request.json()

    if (!method || !amount) {
      return NextResponse.json({ error: 'Méthode et montant requis' }, { status: 400 })
    }

    const subscription = await prisma.subscription.findUnique({
      where: { pharmacyId: session.pharmacyId },
    })
    if (!subscription) return NextResponse.json({ error: 'Aucun abonnement' }, { status: 404 })

    const reference = generateReference()

    // Create payment and extend subscription
    const payment = await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        amount,
        method,
        provider: method,
        reference,
        status: 'completed',
        paidAt: new Date(),
      },
    })

    // Extend subscription by 30 days
    const currentEnd = subscription.endDate ? new Date(subscription.endDate) : new Date()
    const newEnd = new Date(Math.max(currentEnd.getTime(), Date.now()) + 30 * 24 * 60 * 60 * 1000)

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        endDate: newEnd,
        status: 'ACTIVE',
      },
    })

    return NextResponse.json({ payment, reference, newEndDate: newEnd }, { status: 201 })
  } catch (error) {
    console.error('Payments POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
