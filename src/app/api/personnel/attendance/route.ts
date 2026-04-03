import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    const where: Record<string, unknown> = { pharmacyId: session.pharmacyId }
    if (date) {
      const day = new Date(date)
      day.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)
      where.date = { gte: day, lte: end }
    }

    const attendances = await prisma.attendance.findMany({
      where: where as never,
      include: { user: { select: { firstName: true, lastName: true, role: true } } },
      orderBy: { date: 'desc' },
      take: 50,
    })

    return NextResponse.json({ attendances })
  } catch (error) {
    console.error('Attendance GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { userId, type } = await request.json() // type: 'checkIn' or 'checkOut'
    const targetUserId = userId || session.id

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    let attendance = await prisma.attendance.findFirst({
      where: { userId: targetUserId, pharmacyId: session.pharmacyId, date: { gte: today, lte: endOfDay } },
    })

    if (type === 'checkIn') {
      if (attendance) return NextResponse.json({ error: 'Deja pointe aujourd\'hui' }, { status: 400 })
      const now = new Date()
      const isLate = now.getHours() >= 9
      attendance = await prisma.attendance.create({
        data: {
          userId: targetUserId, pharmacyId: session.pharmacyId,
          date: now, checkIn: now, status: isLate ? 'late' : 'present',
        },
      })
    } else {
      if (!attendance) return NextResponse.json({ error: 'Pas de pointage d\'arrivee' }, { status: 400 })
      attendance = await prisma.attendance.update({
        where: { id: attendance.id },
        data: { checkOut: new Date() },
      })
    }

    return NextResponse.json({ attendance })
  } catch (error) {
    console.error('Attendance POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
