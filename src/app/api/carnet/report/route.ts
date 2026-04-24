import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { buildCarnetReport } from '@/lib/carnet-report'

// GET /api/carnet/report — JSON carnet report
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const report = await buildCarnetReport({
      pharmacyId: session.pharmacyId,
      search: searchParams.get('search') || '',
      filter: (searchParams.get('filter') as 'inDebt' | 'settled' | '') || '',
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo'),
    })

    return NextResponse.json(report)
  } catch (error) {
    console.error('Error building carnet report:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
