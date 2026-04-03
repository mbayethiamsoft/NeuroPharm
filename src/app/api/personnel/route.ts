import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, hashPassword, createAuditLog } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    if (!['ADMIN', 'SUPER_ADMIN', 'PHARMACIST'].includes(session.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    const users = await prisma.user.findMany({
      where: { pharmacyId: session.pharmacyId, isActive: true },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, role: true, isActive: true, lastLogin: true, createdAt: true,
      },
      orderBy: { firstName: 'asc' },
    })

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Personnel GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    const { firstName, lastName, email, password, phone, role } = await request.json()
    if (!firstName || !lastName || !email || !password) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) return NextResponse.json({ error: 'Email deja utilise' }, { status: 409 })

    const user = await prisma.user.create({
      data: {
        firstName, lastName, email: email.toLowerCase(),
        password: await hashPassword(password),
        phone, role: role || 'CASHIER', pharmacyId: session.pharmacyId,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId, userId: session.id,
      action: 'CREATE', entity: 'user', entityId: user.id,
    })

    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    console.error('Personnel POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
