import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

const VALID_TYPES = ['ASSURANCE', 'MUTUELLE', 'CMU', 'IPM', 'AUTRE']

// GET /api/insurances/[id] — full detail: institution, beneficiaries (incl. holders/dependents),
// recent insurance sales and aggregated totals.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }
    const { id } = await params

    const insurance = await prisma.insurance.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!insurance) {
      return NextResponse.json({ error: 'Institution introuvable' }, { status: 404 })
    }

    const [beneficiaries, sales] = await Promise.all([
      prisma.insuranceBeneficiary.findMany({
        where: { insuranceId: id, pharmacyId: session.pharmacyId, isActive: true },
        orderBy: [{ relationship: 'asc' }, { fullName: 'asc' }],
      }),
      prisma.sale.findMany({
        where: {
          insuranceId: id,
          pharmacyId: session.pharmacyId,
          paymentMethod: 'INSURANCE',
          status: { not: 'cancelled' },
        },
        include: {
          beneficiary: { select: { id: true, fullName: true, membershipNumber: true } },
          user: { select: { firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ])

    const totals = sales.reduce(
      (acc, s) => {
        acc.salesCount += 1
        const covered = s.insuranceAmount || 0
        acc.totalCovered += covered
        acc.totalPatient += s.patientAmount || 0
        if (s.insuranceClaimStatus === 'paid') {
          acc.totalPaid += covered
        } else if (s.insuranceClaimStatus !== 'rejected') {
          acc.outstanding += covered
        }
        return acc
      },
      { salesCount: 0, totalCovered: 0, totalPatient: 0, totalPaid: 0, outstanding: 0 }
    )

    return NextResponse.json({ insurance, beneficiaries, sales, totals })
  } catch (error) {
    console.error('Error fetching insurance:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// PUT /api/insurances/[id] — update institution
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }
    const { id } = await params

    const existing = await prisma.insurance.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Institution introuvable' }, { status: 404 })
    }

    const body = await request.json()
    const name = body.name !== undefined ? String(body.name).trim() : existing.name
    const type =
      body.type !== undefined && VALID_TYPES.includes(body.type) ? body.type : existing.type
    const code = body.code !== undefined ? String(body.code).trim() || null : existing.code
    const contactName =
      body.contactName !== undefined ? String(body.contactName).trim() || null : existing.contactName
    const phone = body.phone !== undefined ? String(body.phone).trim() || null : existing.phone
    const email = body.email !== undefined ? String(body.email).trim() || null : existing.email
    const address = body.address !== undefined ? String(body.address).trim() || null : existing.address
    const notes = body.notes !== undefined ? String(body.notes).trim() || null : existing.notes
    const coverageRate =
      body.coverageRate !== undefined && Number.isFinite(Number(body.coverageRate))
        ? Math.max(0, Math.min(100, Number(body.coverageRate)))
        : existing.coverageRate

    if (!name) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    }
    if (name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.insurance.findFirst({
        where: {
          pharmacyId: session.pharmacyId,
          name: { equals: name, mode: 'insensitive' },
          NOT: { id },
        },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: 'Une institution porte déjà ce nom' },
          { status: 409 }
        )
      }
    }

    const insurance = await prisma.insurance.update({
      where: { id },
      data: { name, type, code, contactName, phone, email, address, notes, coverageRate },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'UPDATE',
      entity: 'insurance',
      entityId: id,
      details: JSON.stringify({ name, type, coverageRate }),
    })

    return NextResponse.json({ insurance })
  } catch (error) {
    console.error('Error updating insurance:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// DELETE /api/insurances/[id] — soft delete (isActive=false)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }
    const { id } = await params

    const existing = await prisma.insurance.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Institution introuvable' }, { status: 404 })
    }

    await prisma.insurance.update({ where: { id }, data: { isActive: false } })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'DELETE',
      entity: 'insurance',
      entityId: id,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting insurance:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
