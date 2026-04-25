import { prisma } from './prisma'

export type ClaimStatus = 'pending' | 'billed' | 'paid' | 'rejected'

export interface InsuranceReportItemRow {
  name: string
  quantity: number
  unitPrice: number
  total: number
}

export interface InsuranceReportRow {
  saleId: string
  receiptNumber: string
  date: Date
  beneficiaryName: string | null
  beneficiaryNumber: string | null
  beneficiaryRelationship: string | null
  holderName: string | null
  claimRef: string | null
  claimStatus: ClaimStatus
  saleTotal: number
  coverageRate: number | null
  insuranceAmount: number
  patientAmount: number
  items: InsuranceReportItemRow[]
  cashier: string
  isPrescription: boolean
}

export interface InsuranceReportTotals {
  salesCount: number
  saleTotal: number
  totalCovered: number
  totalPatient: number
  totalPaid: number
  outstanding: number
  byStatus: Record<ClaimStatus, { count: number; amount: number }>
}

export interface InsuranceReportInstitution {
  id: string
  name: string
  type: string
  code: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  coverageRate: number
}

export interface InsuranceReportParams {
  pharmacyId: string
  insuranceId?: string | null
  status?: ClaimStatus | '' | null
  beneficiaryId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  search?: string | null
}

export interface InsuranceReportResult {
  institution: InsuranceReportInstitution | null // null when querying across institutions
  rows: InsuranceReportRow[]
  totals: InsuranceReportTotals
  dateFrom: Date | null
  dateTo: Date | null
  filters: {
    insuranceId: string | null
    status: ClaimStatus | null
    beneficiaryId: string | null
    search: string | null
  }
}

const emptyTotals = (): InsuranceReportTotals => ({
  salesCount: 0,
  saleTotal: 0,
  totalCovered: 0,
  totalPatient: 0,
  totalPaid: 0,
  outstanding: 0,
  byStatus: {
    pending: { count: 0, amount: 0 },
    billed: { count: 0, amount: 0 },
    paid: { count: 0, amount: 0 },
    rejected: { count: 0, amount: 0 },
  },
})

const formatReceiptNumber = (id: string) => id.slice(-8).toUpperCase()

export async function buildInsuranceReport(
  params: InsuranceReportParams
): Promise<InsuranceReportResult> {
  const { pharmacyId, insuranceId, status, beneficiaryId, dateFrom, dateTo, search } = params

  const where: Record<string, unknown> = {
    pharmacyId,
    paymentMethod: 'INSURANCE',
    status: { not: 'cancelled' },
  }
  if (insuranceId) where.insuranceId = insuranceId
  if (beneficiaryId) where.beneficiaryId = beneficiaryId
  if (status) where.insuranceClaimStatus = status

  let parsedFrom: Date | null = null
  let parsedTo: Date | null = null
  const dateRange: { gte?: Date; lte?: Date } = {}
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
  if (dateRange.gte || dateRange.lte) where.createdAt = dateRange

  if (search && search.trim()) {
    const term = search.trim()
    where.OR = [
      { customerName: { contains: term, mode: 'insensitive' } },
      { customerPhone: { contains: term } },
      { id: { endsWith: term.toLowerCase() } },
      { insuranceClaimRef: { contains: term, mode: 'insensitive' } },
      { beneficiary: { fullName: { contains: term, mode: 'insensitive' } } },
      { beneficiary: { membershipNumber: { contains: term, mode: 'insensitive' } } },
    ]
  }

  const sales = await prisma.sale.findMany({
    where: where as never,
    include: {
      items: { include: { medication: { select: { name: true } } } },
      beneficiary: {
        select: {
          id: true,
          fullName: true,
          membershipNumber: true,
          relationship: true,
          holder: { select: { fullName: true } },
        },
      },
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  let institution: InsuranceReportInstitution | null = null
  if (insuranceId) {
    const ins = await prisma.insurance.findFirst({
      where: { id: insuranceId, pharmacyId },
    })
    if (ins) {
      institution = {
        id: ins.id,
        name: ins.name,
        type: ins.type,
        code: ins.code,
        contactName: ins.contactName,
        phone: ins.phone,
        email: ins.email,
        address: ins.address,
        coverageRate: ins.coverageRate,
      }
    }
  }

  const rows: InsuranceReportRow[] = sales.map((s) => {
    const claimStatus = (s.insuranceClaimStatus as ClaimStatus) || 'pending'
    return {
      saleId: s.id,
      receiptNumber: formatReceiptNumber(s.id),
      date: s.createdAt,
      beneficiaryName: s.beneficiary?.fullName ?? s.customerName ?? null,
      beneficiaryNumber: s.beneficiary?.membershipNumber ?? null,
      beneficiaryRelationship: s.beneficiary?.relationship ?? null,
      holderName: s.beneficiary?.holder?.fullName ?? null,
      claimRef: s.insuranceClaimRef,
      claimStatus,
      saleTotal: s.total,
      coverageRate: s.insuranceCoverage,
      insuranceAmount: s.insuranceAmount || 0,
      patientAmount: s.patientAmount || 0,
      items: s.items.map((it) => ({
        name: it.medication.name,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
      })),
      cashier: s.user ? `${s.user.firstName} ${s.user.lastName}`.trim() : '—',
      isPrescription: s.isPrescription,
    }
  })

  const totals = rows.reduce((acc, r) => {
    acc.salesCount += 1
    acc.saleTotal += r.saleTotal
    acc.totalCovered += r.insuranceAmount
    acc.totalPatient += r.patientAmount
    if (r.claimStatus === 'paid') acc.totalPaid += r.insuranceAmount
    else if (r.claimStatus !== 'rejected') acc.outstanding += r.insuranceAmount
    acc.byStatus[r.claimStatus].count += 1
    acc.byStatus[r.claimStatus].amount += r.insuranceAmount
    return acc
  }, emptyTotals())

  return {
    institution,
    rows,
    totals,
    dateFrom: parsedFrom,
    dateTo: parsedTo,
    filters: {
      insuranceId: insuranceId || null,
      status: (status as ClaimStatus | null) || null,
      beneficiaryId: beneficiaryId || null,
      search: search || null,
    },
  }
}
