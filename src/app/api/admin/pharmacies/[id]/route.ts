import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (session?.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })

    const { id } = await params
    const { isActive, subscriptionStatus } = await request.json()

    if (isActive !== undefined) {
      await prisma.pharmacy.update({ where: { id }, data: { isActive } })
    }
    if (subscriptionStatus) {
      await prisma.subscription.update({ where: { pharmacyId: id }, data: { status: subscriptionStatus } })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin pharmacy PUT:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
