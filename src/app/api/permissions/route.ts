import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { ALL_MENU_KEYS, DEFAULT_PERMISSIONS } from '@/lib/rbac'

// GET: Fetch permissions for a user or all users in pharmacy
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    // Non-admin users can only fetch their own permissions
    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.role) && userId !== session.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    if (userId) {
      // Fetch specific user permissions
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, permissions: true },
      })
      if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 })

      // Merge default + custom permissions
      const customPerms = new Map(user.permissions.map(p => [p.menuKey, p.canAccess]))
      const defaultPerms = DEFAULT_PERMISSIONS[user.role] || []

      const permissions: Record<string, boolean> = {}
      for (const key of ALL_MENU_KEYS) {
        if (customPerms.has(key)) {
          permissions[key] = customPerms.get(key) ?? false
        } else {
          permissions[key] = defaultPerms.includes(key)
        }
      }

      return NextResponse.json({ userId, role: user.role, permissions })
    }

    // Admin: fetch all users in their pharmacy with their permissions
    if (session.role === 'ADMIN' && session.pharmacyId) {
      const users = await prisma.user.findMany({
        where: { pharmacyId: session.pharmacyId, role: { not: 'SUPER_ADMIN' } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          isActive: true,
          permissions: true,
        },
        orderBy: { firstName: 'asc' },
      })

      const result = users.map(user => {
        const customPerms = new Map(user.permissions.map(p => [p.menuKey, p.canAccess]))
        const defaultPerms = DEFAULT_PERMISSIONS[user.role] || []

        const permissions: Record<string, boolean> = {}
        for (const key of ALL_MENU_KEYS) {
          if (customPerms.has(key)) {
            permissions[key] = customPerms.get(key) ?? false
          } else {
            permissions[key] = user.role === 'ADMIN' ? true : defaultPerms.includes(key)
          }
        }

        return {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          permissions,
        }
      })

      return NextResponse.json({ users: result })
    }

    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  } catch (error) {
    console.error('Permissions GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PUT: Update permissions for a user (Admin only)
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { userId, permissions } = await request.json()

    if (!userId || !permissions || typeof permissions !== 'object') {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
    }

    // Verify the target user belongs to admin's pharmacy (unless SuperAdmin)
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { pharmacyId: true, role: true },
    })
    if (!targetUser) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 })

    if (session.role === 'ADMIN' && targetUser.pharmacyId !== session.pharmacyId) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Can't modify ADMIN or SUPER_ADMIN permissions
    if (targetUser.role === 'ADMIN' || targetUser.role === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Impossible de modifier les permissions admin' }, { status: 400 })
    }

    // Upsert each permission
    for (const [menuKey, canAccess] of Object.entries(permissions)) {
      if (!ALL_MENU_KEYS.includes(menuKey as typeof ALL_MENU_KEYS[number])) continue

      await prisma.userPermission.upsert({
        where: { userId_menuKey: { userId, menuKey } },
        create: { userId, menuKey, canAccess: Boolean(canAccess) },
        update: { canAccess: Boolean(canAccess) },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Permissions PUT:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
