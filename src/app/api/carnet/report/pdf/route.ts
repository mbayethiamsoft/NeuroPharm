import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { buildCarnetReport } from '@/lib/carnet-report'
import { buildCarnetReportHtml } from '@/lib/carnet-report-html'

// GET /api/carnet/report/pdf — HTML page auto-printable (user saves as PDF via browser)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return new Response('Non autorise', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const filter = (searchParams.get('filter') as 'inDebt' | 'settled' | '') || ''
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const [report, pharmacy] = await Promise.all([
      buildCarnetReport({
        pharmacyId: session.pharmacyId,
        search,
        filter,
        dateFrom,
        dateTo,
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

    const html = buildCarnetReportHtml(report, pharmacy, {
      search,
      filter,
      autoPrint: true,
    })

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Error generating carnet PDF:', error)
    return new Response('Erreur serveur', { status: 500 })
  }
}
