import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSuperAdminSession, hashPassword } from '@/lib/auth'
import { createSystemLog } from '@/lib/system-log'

export async function GET(request: NextRequest) {
  try {
    const session = await getSuperAdminSession()
    if (session?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const pharmacyId = searchParams.get('pharmacyId')
    const role = searchParams.get('role')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}
    if (pharmacyId) where.pharmacyId = pharmacyId
    if (role) where.role = role
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        pharmacyId: true,
        pharmacy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ users })
  } catch (error) {
    console.error('SuperAdmin users GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSuperAdminSession()
    if (session?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, action } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 })
    }

    if (action === 'toggle_active') {
      await prisma.user.update({
        where: { id: userId },
        data: { isActive: !user.isActive },
      })
      await createSystemLog({
        action: user.isActive ? 'USER_DEACTIVATED' : 'USER_ACTIVATED',
        userId: session.id,
        userEmail: session.email,
        targetId: userId,
        targetType: 'user',
        details: `${user.email} ${user.isActive ? 'désactivé' : 'activé'}`,
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'reset_password') {
      const newPassword = body.newPassword
      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json({ error: 'Mot de passe invalide (min 6 caractères)' }, { status: 400 })
      }
      await prisma.user.update({
        where: { id: userId },
        data: { password: await hashPassword(newPassword) },
      })
      await createSystemLog({
        action: 'PASSWORD_RESET',
        userId: session.id,
        userEmail: session.email,
        targetId: userId,
        targetType: 'user',
        details: `Mot de passe réinitialisé pour ${user.email}`,
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 })
  } catch (error) {
    console.error('SuperAdmin users PUT:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
