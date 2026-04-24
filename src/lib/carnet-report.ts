import { prisma } from './prisma'

export interface CarnetReportRow {
  id: string
  fullName: string
  phone: string | null
  creditLimit: number
  totalDebt: number
  totalPaid: number
  balance: number
  lastSaleAt: Date | null
  lastPaymentAt: Date | null
}

export interface CarnetReportTotals {
  totalCount: number
  inDebtCount: number
  totalDebt: number
  totalPaid: number
  balance: number
}

export interface CarnetReportParams {
  pharmacyId: string
  search?: string
  filter?: 'inDebt' | 'settled' | ''
  dateFrom?: string | null
  dateTo?: string | null
}

export interface CarnetReportResult {
  rows: CarnetReportRow[]
  totals: CarnetReportTotals
  dateFrom: Date | null
  dateTo: Date | null
}

export async function buildCarnetReport(params: CarnetReportParams): Promise<CarnetReportResult> {
  const { pharmacyId, search, filter, dateFrom, dateTo } = params

  const where: Record<string, unknown> = {
    pharmacyId,
    isActive: true,
  }
  if (search && search.trim()) {
    where.OR = [
      { fullName: { contains: search.trim(), mode: 'insensitive' } },
      { phone: { contains: search.trim() } },
    ]
  }

  const customers = await prisma.customer.findMany({
    where: where as never,
    orderBy: { fullName: 'asc' },
  })
  if (customers.length === 0) {
    return {
      rows: [],
      totals: { totalCount: 0, inDebtCount: 0, totalDebt: 0, totalPaid: 0, balance: 0 },
      dateFrom: null,
      dateTo: null,
    }
  }

  const dateRange: { gte?: Date; lte?: Date } = {}
  let parsedFrom: Date | null = null
  let parsedTo: Date | null = null
  if (dateFrom) {
    parsedFrom = new Date(dateFrom)
    parsedFrom.setHours(0, 0, 0, 0)
    dateRange.gte = parsedFrom
  }
  if (dateTo) {
    parsedTo = new Date(dateTo)
    parsedTo.setHours(23, 59, 59, 999)
    dateRange.lte = parsedTo
  }
  const dateFilter = dateRange.gte || dateRange.lte ? { createdAt: dateRange } : {}

  const customerIds = customers.map((c) => c.id)

  const [saleAggs, paymentAggs, lastSales, lastPayments] = await Promise.all([
    prisma.sale.groupBy({
      by: ['customerId'],
      where: {
        customerId: { in: customerIds },
        pharmacyId,
        paymentMethod: 'CREDIT',
        status: { not: 'cancelled' },
        ...dateFilter,
      },
      _sum: { total: true },
    }),
    prisma.creditPayment.groupBy({
      by: ['customerId'],
      where: { customerId: { in: customerIds }, pharmacyId, ...dateFilter },
      _sum: { amount: true },
    }),
    prisma.sale.findMany({
      where: {
        customerId: { in: customerIds },
        pharmacyId,
        paymentMethod: 'CREDIT',
        status: { not: 'cancelled' },
        ...dateFilter,
      },
      select: { customerId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.creditPayment.findMany({
      where: { customerId: { in: customerIds }, pharmacyId, ...dateFilter },
      select: { customerId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const debtMap = new Map(saleAggs.map((a) => [a.customerId, a._sum.total || 0]))
  const paidMap = new Map(paymentAggs.map((a) => [a.customerId, a._sum.amount || 0]))

  const lastSaleMap = new Map<string, Date>()
  for (const s of lastSales) {
    if (s.customerId && !lastSaleMap.has(s.customerId)) lastSaleMap.set(s.customerId, s.createdAt)
  }
  const lastPaymentMap = new Map<string, Date>()
  for (const p of lastPayments) {
    if (!lastPaymentMap.has(p.customerId)) lastPaymentMap.set(p.customerId, p.createdAt)
  }

  let rows: CarnetReportRow[] = customers.map((c) => {
    const totalDebt = debtMap.get(c.id) || 0
    const totalPaid = paidMap.get(c.id) || 0
    return {
      id: c.id,
      fullName: c.fullName,
      phone: c.phone,
      creditLimit: c.creditLimit,
      totalDebt,
      totalPaid,
      balance: totalDebt - totalPaid,
      lastSaleAt: lastSaleMap.get(c.id) || null,
      lastPaymentAt: lastPaymentMap.get(c.id) || null,
    }
  })

  if (filter === 'inDebt') rows = rows.filter((r) => r.balance > 0.009)
  if (filter === 'settled') rows = rows.filter((r) => r.balance <= 0.009)

  const totals = rows.reduce(
    (acc, r) => {
      acc.totalDebt += r.totalDebt
      acc.totalPaid += r.totalPaid
      acc.balance += r.balance
      if (r.balance > 0.009) acc.inDebtCount += 1
      return acc
    },
    { totalCount: 0, inDebtCount: 0, totalDebt: 0, totalPaid: 0, balance: 0 }
  )
  totals.totalCount = rows.length

  return { rows, totals, dateFrom: parsedFrom, dateTo: parsedTo }
}
