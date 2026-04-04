import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { calculatePayroll } from '@/lib/payroll-calc'

// POST /api/payroll/generate — Auto-generate monthly draft bulletins for all employees
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    // Only ADMIN/SUPER_ADMIN can auto-generate
    if (!['ADMIN', 'SUPER_ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const month = Number(body.month || new Date().getMonth() + 1)
    const year = Number(body.year || new Date().getFullYear())

    // Get all active users in this pharmacy
    const employees = await prisma.user.findMany({
      where: { pharmacyId: session.pharmacyId, isActive: true },
    })

    if (employees.length === 0) {
      return NextResponse.json({ error: 'Aucun employé actif trouvé' }, { status: 404 })
    }

    // Check existing payrolls for this month
    const existing = await prisma.payroll.findMany({
      where: { pharmacyId: session.pharmacyId, month, year },
      select: { employeeName: true },
    })
    const existingNames = new Set(existing.map(p => p.employeeName))

    // Get previous month payrolls for salary reference
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevPayrolls = await prisma.payroll.findMany({
      where: { pharmacyId: session.pharmacyId, month: prevMonth, year: prevYear },
    })
    const prevByName = new Map(prevPayrolls.map(p => [`${p.employeeName}`, p]))

    const created: string[] = []
    const skipped: string[] = []

    for (const emp of employees) {
      const fullName = `${emp.firstName} ${emp.lastName}`

      if (existingNames.has(fullName)) {
        skipped.push(fullName)
        continue
      }

      // Use previous month data as template, or defaults
      const prev = prevByName.get(fullName)
      const baseSalary = prev?.baseSalary || 0
      const isCadre = prev ? prev.ipresCadre > 0 : false

      const calc = calculatePayroll({
        baseSalary,
        seniority: prev?.seniority || 0,
        transportAllowance: prev?.transportAllowance || 0,
        housingAllowance: prev?.housingAllowance || 0,
        bonuses: prev?.bonuses || 0,
        overtime: 0,
        isCadre,
      })

      await prisma.payroll.create({
        data: {
          pharmacyId: session.pharmacyId,
          employeeName: fullName,
          employeeRole: prev?.employeeRole || emp.role,
          month,
          year,
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
      created.push(fullName)
    }

    return NextResponse.json({
      message: `${created.length} bulletin(s) créé(s), ${skipped.length} déjà existant(s)`,
      created,
      skipped,
      month,
      year,
    })
  } catch (error) {
    console.error('Payroll generate:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
