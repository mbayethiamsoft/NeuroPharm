import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSuperAdminSession } from '@/lib/auth'
import { createSystemLog } from '@/lib/system-log'

export async function GET() {
  try {
    const session = await getSuperAdminSession()
    if (session?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const configs = await prisma.saasConfig.findMany({
      orderBy: { key: 'asc' },
    })

    // Return as key-value map
    const settings: Record<string, string> = {}
    for (const c of configs) {
      settings[c.key] = c.value
    }

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('SuperAdmin settings GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSuperAdminSession()
    if (session?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { settings } = await request.json()

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Format invalide' }, { status: 400 })
    }

    // Upsert each key-value pair
    for (const [key, value] of Object.entries(settings)) {
      await prisma.saasConfig.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      })
    }

    await createSystemLog({
      action: 'SAAS_SETTINGS_UPDATED',
      userId: session.id,
      userEmail: session.email,
      details: `Paramètres modifiés: ${Object.keys(settings).join(', ')}`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('SuperAdmin settings PUT:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
