import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { calculatePayroll } from '@/lib/payroll-calc'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') ? Number(searchParams.get('month')) : undefined
    const year = searchParams.get('year') ? Number(searchParams.get('year')) : undefined
    const status = searchParams.get('status') || undefined

    const where: Record<string, unknown> = { pharmacyId: session.pharmacyId }
    if (month) where.month = month
    if (year) where.year = year
    if (status) where.status = status

    const payrolls = await prisma.payroll.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { employeeName: 'asc' }],
    })

    // Aggregate stats
    const totalGross = payrolls.reduce((s, p) => s + p.grossSalary, 0)
    const totalNet = payrolls.reduce((s, p) => s + p.netSalary, 0)
    const totalEmployerCharges = payrolls.reduce((s, p) => s + p.employerIpres + p.employerCss + p.employerCfce, 0)
    const draftCount = payrolls.filter(p => p.status === 'draft').length
    const validatedCount = payrolls.filter(p => p.status === 'validated').length
    const paidCount = payrolls.filter(p => p.status === 'paid').length

    return NextResponse.json({
      payrolls,
      stats: { totalGross, totalNet, totalEmployerCharges, draftCount, validatedCount, paidCount, total: payrolls.length },
    })
  } catch (error) {
    console.error('Payroll GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { employeeName, employeeRole, month, year, baseSalary, seniority, transportAllowance, housingAllowance, bonuses, overtime, isCadre } = body

    if (!employeeName || !baseSalary || !month || !year) {
      return NextResponse.json({ error: 'Champs obligatoires manquants (employeeName, baseSalary, month, year)' }, { status: 400 })
    }

    // Check for duplicate
    const existing = await prisma.payroll.findFirst({
      where: { pharmacyId: session.pharmacyId, employeeName, month: Number(month), year: Number(year) },
    })
    if (existing) {
      return NextResponse.json({ error: `Un bulletin existe déjà pour ${employeeName} en ${month}/${year}` }, { status: 409 })
    }

    // Calculate payroll using Senegal-compliant calculator
    const calc = calculatePayroll({
      baseSalary: Number(baseSalary),
      seniority: Number(seniority || 0),
      transportAllowance: Number(transportAllowance || 0),
      housingAllowance: Number(housingAllowance || 0),
      bonuses: Number(bonuses || 0),
      overtime: Number(overtime || 0),
      isCadre: Boolean(isCadre),
    })

    const payroll = await prisma.payroll.create({
      data: {
        pharmacyId: session.pharmacyId,
        employeeName,
        employeeRole: employeeRole || null,
        month: Number(month),
        year: Number(year),
        baseSalary: calc.baseSalary,
        seniority: calc.seniority,
        transportAllowance: calc.transportAllowance,
        housingAllowance: calc.housingAllowance,
        bonuses: calc.bonuses,
        overtime: calc.overtime,
        grossSalary: calc.grossSalary,
        ipresGeneral: calc.ipresGeneral,
        ipresCadre: calc.ipresCadre,
        cssMaladie: calc.cssMaladie,
        incomeTax: calc.incomeTax,
        trimf: calc.trimf,
        employerIpres: calc.employerIpres,
        employerCss: calc.employerCss,
        employerCfce: calc.employerCfce,
        totalGross: calc.totalGross,
        totalDeductions: calc.totalDeductions,
        netSalary: calc.netSalary,
        status: 'draft',
      },
    })

    return NextResponse.json({ payroll }, { status: 201 })
  } catch (error) {
    console.error('Payroll POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
