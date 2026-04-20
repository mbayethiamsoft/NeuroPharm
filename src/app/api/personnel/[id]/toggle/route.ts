import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
      return NextResponse.json({ error: 'Impossible de bloquer votre propre compte' }, { status: 400 })
    }

    const newActive = !target.isActive
    await prisma.user.update({ where: { id }, data: { isActive: newActive } })

    await createAuditLog({
      pharmacyId: session.pharmacyId, userId: session.id,
      action: newActive ? 'UNBLOCK' : 'BLOCK', entity: 'user', entityId: id,
    })

    return NextResponse.json({ isActive: newActive })
  } catch (error) {
    console.error('Personnel TOGGLE:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
