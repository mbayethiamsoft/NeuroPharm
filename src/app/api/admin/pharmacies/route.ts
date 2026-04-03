import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, hashPassword } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (session?.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })

    const pharmacies = await prisma.pharmacy.findMany({
      include: {
        subscription: true,
        _count: { select: { users: true, sales: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ pharmacies })
  } catch (error) {
    console.error('Admin pharmacies GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (session?.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })

    const { pharmacyName, adminEmail, adminPassword, adminFirstName, adminLastName, plan } = await request.json()

    const result = await prisma.$transaction(async (tx) => {
      const pharmacy = await tx.pharmacy.create({ data: { name: pharmacyName } })
      const user = await tx.user.create({
        data: {
          email: adminEmail.toLowerCase(), password: await hashPassword(adminPassword),
          firstName: adminFirstName, lastName: adminLastName,
          role: 'ADMIN', pharmacyId: pharmacy.id,
        },
      })
      await tx.subscription.create({
        data: {
          pharmacyId: pharmacy.id, plan: plan || 'TRIAL', status: 'ACTIVE',
          startDate: new Date(), endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      })
      await tx.pharmacySettings.create({ data: { pharmacyId: pharmacy.id } })
      return { pharmacy, user }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Admin pharmacies POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
