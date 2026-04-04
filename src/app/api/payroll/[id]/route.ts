import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { calculatePayroll } from '@/lib/payroll-calc'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { id } = await params
    const payroll = await prisma.payroll.findFirst({
      where: { id, pharmacyId: session.pharmacyId },
    })
    if (!payroll) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

    return NextResponse.json({ payroll })
  } catch (error) {
    console.error('Payroll GET [id]:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

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

    // Workflow: validate
    if (body.action === 'validate') {
      if (payroll.status !== 'draft') {
        return NextResponse.json({ error: 'Seuls les bulletins en brouillon peuvent être validés' }, { status: 400 })
      }
      const updated = await prisma.payroll.update({
        where: { id },
        data: {
          status: 'validated',
          validatedBy: session.id,
          validatedAt: new Date(),
        },
      })
      return NextResponse.json({ payroll: updated })
    }

    // Workflow: mark as paid
    if (body.action === 'pay') {
      if (payroll.status !== 'validated') {
        return NextResponse.json({ error: 'Seuls les bulletins validés peuvent être payés' }, { status: 400 })
      }
      const updated = await prisma.payroll.update({
        where: { id },
        data: {
          status: 'paid',
          paidAt: new Date(),
        },
      })
      return NextResponse.json({ payroll: updated })
    }

    // Workflow: revert to draft (only from validated)
    if (body.action === 'revert') {
      if (payroll.status !== 'validated') {
        return NextResponse.json({ error: 'Seuls les bulletins validés peuvent être remis en brouillon' }, { status: 400 })
      }
      const updated = await prisma.payroll.update({
        where: { id },
        data: {
          status: 'draft',
          validatedBy: null,
          validatedAt: null,
        },
      })
      return NextResponse.json({ payroll: updated })
    }

    // Edit: recalculate payroll (only drafts)
    if (payroll.status !== 'draft') {
      return NextResponse.json({ error: 'Seuls les bulletins en brouillon peuvent être modifiés' }, { status: 400 })
    }

    const calc = calculatePayroll({
      baseSalary: Number(body.baseSalary ?? payroll.baseSalary),
      seniority: Number(body.seniority ?? payroll.seniority),
      transportAllowance: Number(body.transportAllowance ?? payroll.transportAllowance),
      housingAllowance: Number(body.housingAllowance ?? payroll.housingAllowance),
      bonuses: Number(body.bonuses ?? payroll.bonuses),
      overtime: Number(body.overtime ?? payroll.overtime),
      isCadre: body.isCadre !== undefined ? Boolean(body.isCadre) : payroll.ipresCadre > 0,
    })

    const updated = await prisma.payroll.update({
      where: { id },
      data: {
        employeeName: body.employeeName || payroll.employeeName,
        employeeRole: body.employeeRole !== undefined ? body.employeeRole : payroll.employeeRole,
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
        notes: body.notes !== undefined ? body.notes : payroll.notes,
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

    if (payroll.status === 'paid') {
      return NextResponse.json({ error: 'Impossible de supprimer un bulletin payé' }, { status: 400 })
    }

    await prisma.payroll.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Payroll DELETE:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
