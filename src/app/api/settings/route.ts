import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const [pharmacy, settings, subscription] = await Promise.all([
      prisma.pharmacy.findUnique({ where: { id: session.pharmacyId } }),
      prisma.pharmacySettings.findUnique({ where: { pharmacyId: session.pharmacyId } }),
      prisma.subscription.findUnique({ where: { pharmacyId: session.pharmacyId } }),
    ])

    return NextResponse.json({ pharmacy, settings, subscription })
  } catch (error) {
    console.error('Settings GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    const { pharmacy: pharmacyData, settings: settingsData } = await request.json()

    if (pharmacyData) {
      await prisma.pharmacy.update({
        where: { id: session.pharmacyId },
        data: {
          name: pharmacyData.name, address: pharmacyData.address,
          city: pharmacyData.city, phone: pharmacyData.phone,
          email: pharmacyData.email, taxId: pharmacyData.taxId,
        },
      })
    }

    if (settingsData) {
      await prisma.pharmacySettings.upsert({
        where: { pharmacyId: session.pharmacyId },
        update: settingsData,
        create: { pharmacyId: session.pharmacyId, ...settingsData },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Settings PUT:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
