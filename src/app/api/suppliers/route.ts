import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

    const suppliers = await prisma.supplier.findMany({
      where: {
        pharmacyId: session.pharmacyId,
        isActive: true,
        ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ suppliers })
  } catch (error) {
    console.error('Suppliers GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { name, contact, phone, email, address } = await request.json()
    if (!name) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })

    const supplier = await prisma.supplier.create({
      data: { name, contact, phone, email, address, pharmacyId: session.pharmacyId },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId, userId: session.id,
      action: 'CREATE', entity: 'supplier', entityId: supplier.id,
    })

    return NextResponse.json(supplier, { status: 201 })
  } catch (error) {
    console.error('Suppliers POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
