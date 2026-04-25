import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { buildInsuranceReport, type ClaimStatus } from '@/lib/insurance-report'
import { buildInsuranceReportHtml } from '@/lib/insurance-report-html'

const VALID_STATUSES: ClaimStatus[] = ['pending', 'billed', 'paid', 'rejected']

// GET /api/insurances/report/pdf — auto-printable HTML page (browser saves as PDF).
// Mirrors the carnet PDF route (no headless lib, browser print engine instead).
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return new Response('Non autorise', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusRaw = searchParams.get('status')
    const status =
      statusRaw && VALID_STATUSES.includes(statusRaw as ClaimStatus) ? (statusRaw as ClaimStatus) : ''
    const showItems = searchParams.get('showItems') !== '0'

    const [report, pharmacy] = await Promise.all([
      buildInsuranceReport({
        pharmacyId: session.pharmacyId,
        insuranceId: searchParams.get('insuranceId'),
        beneficiaryId: searchParams.get('beneficiaryId'),
        status,
        dateFrom: searchParams.get('dateFrom'),
        dateTo: searchParams.get('dateTo'),
        search: searchParams.get('search'),
      }),
      prisma.pharmacy.findUnique({
        where: { id: session.pharmacyId },
        select: {
          name: true,
          address: true,
          city: true,
          phone: true,
          email: true,
          taxId: true,
        },
      }),
    ])

    const html = buildInsuranceReportHtml(report, pharmacy, { autoPrint: true, showItems })

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Error generating insurance PDF:', error)
    return new Response('Erreur serveur', { status: 500 })
  }
}
