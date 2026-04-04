import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const payrolls = await prisma.payroll.findMany({
      where: { pharmacyId: session.pharmacyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })

    return NextResponse.json({ payrolls })
  } catch (error) {
    console.error('Payroll GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { employeeName, baseSalary, bonuses, deductions, month, year } = await request.json()

    if (!employeeName || !baseSalary || !month || !year) {
      return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 })
    }

    const netSalary = baseSalary + (bonuses || 0) - (deductions || 0)

    const payroll = await prisma.payroll.create({
      data: {
        pharmacyId: session.pharmacyId,
        employeeName,
        baseSalary,
        bonuses: bonuses || 0,
        deductions: deductions || 0,
        netSalary,
        month,
        year,
      },
    })

    return NextResponse.json({ payroll }, { status: 201 })
  } catch (error) {
    console.error('Payroll POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
