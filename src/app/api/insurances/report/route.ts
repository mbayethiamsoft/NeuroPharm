import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { buildInsuranceReport, type ClaimStatus } from '@/lib/insurance-report'

const VALID_STATUSES: ClaimStatus[] = ['pending', 'billed', 'paid', 'rejected']

// GET /api/insurances/report — JSON report for the dashboard page.
// Query params: insuranceId, beneficiaryId, status, dateFrom, dateTo, search.
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusRaw = searchParams.get('status')
    const status =
      statusRaw && VALID_STATUSES.includes(statusRaw as ClaimStatus) ? (statusRaw as ClaimStatus) : ''

    const report = await buildInsuranceReport({
      pharmacyId: session.pharmacyId,
      insuranceId: searchParams.get('insuranceId'),
      beneficiaryId: searchParams.get('beneficiaryId'),
      status,
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo'),
      search: searchParams.get('search'),
    })

    return NextResponse.json(report)
  } catch (error) {
    console.error('Error building insurance report:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
