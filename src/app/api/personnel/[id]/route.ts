import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    const { id } = await params
    const { firstName, lastName, email, phone, role } = await request.json()

    if (!firstName || !lastName || !email) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const target = await prisma.user.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!target) return NextResponse.json({ error: 'Employe introuvable' }, { status: 404 })

    if (email.toLowerCase() !== target.email) {
      const duplicate = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
      if (duplicate) return NextResponse.json({ error: 'Email deja utilise' }, { status: 409 })
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { firstName, lastName, email: email.toLowerCase(), phone: phone || null, role: role || target.role },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, isActive: true, lastLogin: true, createdAt: true },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId, userId: session.id,
      action: 'UPDATE', entity: 'user', entityId: id,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Personnel PUT:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }

    const { id } = await params

    const target = await prisma.user.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!target) return NextResponse.json({ error: 'Employe introuvable' }, { status: 404 })
    if (target.id === session.id) {
      return NextResponse.json({ error: 'Impossible de supprimer votre propre compte' }, { status: 400 })
    }

    await prisma.user.update({ where: { id }, data: { isActive: false } })

    await createAuditLog({
      pharmacyId: session.pharmacyId, userId: session.id,
      action: 'DELETE', entity: 'user', entityId: id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Personnel DELETE:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
