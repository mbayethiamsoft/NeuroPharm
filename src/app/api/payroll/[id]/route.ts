import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    const payroll = await prisma.payroll.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!payroll) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

    const updated = await prisma.payroll.update({
      where: { id },
      data: {
        status: body.status || payroll.status,
        paidAt: body.status === 'paid' ? new Date() : payroll.paidAt,
      },
    })

    return NextResponse.json({ payroll: updated })
  } catch (error) {
    console.error('Payroll PUT:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { id } = await params

    const payroll = await prisma.payroll.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!payroll) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

    await prisma.payroll.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Payroll DELETE:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
