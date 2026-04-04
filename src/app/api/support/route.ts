import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

// POST: Create a support ticket (public — from login/register pages)
export async function POST(request: NextRequest) {
  try {
    const { name, email, subject, message } = await request.json()

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 })
    }

    if (message.length > 5000) {
      return NextResponse.json({ error: 'Message trop long (max 5000 caractères)' }, { status: 400 })
    }

    const ticket = await prisma.supportTicket.create({
      data: { name, email, subject, message },
    })

    return NextResponse.json({ ticket: { id: ticket.id } }, { status: 201 })
  } catch (error) {
    console.error('Support POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// GET: List support tickets (SuperAdmin only)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (session?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (status) where.status = status

    const tickets = await prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ tickets })
  } catch (error) {
    console.error('Support GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PUT: Update a support ticket (SuperAdmin only)
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    if (session?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { ticketId, status, response, priority } = await request.json()

    if (!ticketId) {
      return NextResponse.json({ error: 'ticketId requis' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (status) data.status = status
    if (priority) data.priority = priority
    if (response) {
      data.response = response
      data.respondedAt = new Date()
      data.respondedBy = session.id
    }

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Support PUT:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
