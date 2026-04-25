import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

const VALID_TYPES = ['ASSURANCE', 'MUTUELLE', 'CMU', 'IPM', 'AUTRE']

// GET /api/insurances — list institutions with aggregated balances
//   ?withTotals=1   → include claim totals (covered/paid/outstanding) and salesCount per institution
//   ?dateFrom & ?dateTo → restrict aggregates to a period (applies to sale.createdAt)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim() || ''
    const withTotals = searchParams.get('withTotals') === '1'
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const where: Record<string, unknown> = {
      pharmacyId: session.pharmacyId,
      isActive: true,
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
      ]
    }

    const insurances = await prisma.insurance.findMany({
      where: where as never,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { beneficiaries: { where: { isActive: true } } } },
      },
    })

    if (!withTotals || insurances.length === 0) {
      return NextResponse.json({
        insurances: insurances.map((i) => ({
          ...i,
          beneficiaryCount: i._count.beneficiaries,
        })),
      })
    }

    const dateRange: { gte?: Date; lte?: Date } = {}
    if (dateFrom) {
      const f = new Date(dateFrom)
      f.setHours(0, 0, 0, 0)
      dateRange.gte = f
    }
    if (dateTo) {
      const t = new Date(dateTo)
      t.setHours(23, 59, 59, 999)
      dateRange.lte = t
    }
    const dateFilter = dateRange.gte || dateRange.lte ? { createdAt: dateRange } : {}

    const insuranceIds = insurances.map((i) => i.id)

    // Pull all matching sales then group by insurance + claim status. We need the
    // breakdown per status (pending/billed/paid/rejected) — groupBy on a single
    // dimension is enough because we slice in JS.
    const sales = await prisma.sale.findMany({
      where: {
        pharmacyId: session.pharmacyId,
        insuranceId: { in: insuranceIds },
        paymentMethod: 'INSURANCE',
        status: { not: 'cancelled' },
        ...dateFilter,
      },
      select: {
        insuranceId: true,
        insuranceAmount: true,
        insuranceClaimStatus: true,
      },
    })

    const totalsMap = new Map<
      string,
      {
        salesCount: number
        totalCovered: number
        totalPaid: number
        outstanding: number
      }
    >()
    for (const s of sales) {
      if (!s.insuranceId) continue
      const cur = totalsMap.get(s.insuranceId) || {
        salesCount: 0,
        totalCovered: 0,
        totalPaid: 0,
        outstanding: 0,
      }
      cur.salesCount += 1
      const covered = s.insuranceAmount || 0
      cur.totalCovered += covered
      if (s.insuranceClaimStatus === 'paid') {
        cur.totalPaid += covered
      } else if (s.insuranceClaimStatus !== 'rejected') {
        cur.outstanding += covered
      }
      totalsMap.set(s.insuranceId, cur)
    }

    return NextResponse.json({
      insurances: insurances.map((i) => ({
        ...i,
        beneficiaryCount: i._count.beneficiaries,
        totals:
          totalsMap.get(i.id) || {
            salesCount: 0,
            totalCovered: 0,
            totalPaid: 0,
            outstanding: 0,
          },
      })),
    })
  } catch (error) {
    console.error('Error fetching insurances:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST /api/insurances — create a new institution
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const body = await request.json()
    const name = (body.name || '').trim()
    const type = VALID_TYPES.includes(body.type) ? body.type : 'ASSURANCE'
    const code = (body.code || '').trim() || null
    const contactName = (body.contactName || '').trim() || null
    const phone = (body.phone || '').trim() || null
    const email = (body.email || '').trim() || null
    const address = (body.address || '').trim() || null
    const notes = (body.notes || '').trim() || null
    const coverageRate = Number.isFinite(Number(body.coverageRate))
      ? Math.max(0, Math.min(100, Number(body.coverageRate)))
      : 80

    if (!name) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    }

    const duplicate = await prisma.insurance.findFirst({
      where: { pharmacyId: session.pharmacyId, name: { equals: name, mode: 'insensitive' } },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: 'Une institution porte déjà ce nom' },
        { status: 409 }
      )
    }

    const insurance = await prisma.insurance.create({
      data: {
        pharmacyId: session.pharmacyId,
        name,
        type,
        code,
        contactName,
        phone,
        email,
        address,
        notes,
        coverageRate,
      },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'CREATE',
      entity: 'insurance',
      entityId: insurance.id,
      details: JSON.stringify({ name, type, coverageRate }),
    })

    return NextResponse.json({ insurance }, { status: 201 })
  } catch (error) {
    console.error('Error creating insurance:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
