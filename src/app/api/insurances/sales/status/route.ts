import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

const VALID_STATUSES = ['pending', 'billed', 'paid', 'rejected']

// PATCH /api/insurances/sales/status
//   body: { saleIds: string[], status: 'pending' | 'billed' | 'paid' | 'rejected' }
// Bulk update of insuranceClaimStatus for one or more INSURANCE sales of the
// current pharmacy. Used from the claims report to mark a batch as billed/paid.
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const body = await request.json()
    const saleIds: string[] = Array.isArray(body.saleIds) ? body.saleIds.filter(Boolean) : []
    const status: string = String(body.status || '')

    if (saleIds.length === 0) {
      return NextResponse.json({ error: 'Aucune vente sélectionnée' }, { status: 400 })
    }
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    }

    // Confine to the current pharmacy + INSURANCE sales — protects against IDs
    // crafted from outside the report context.
    const result = await prisma.sale.updateMany({
      where: {
        id: { in: saleIds },
        pharmacyId: session.pharmacyId,
        paymentMethod: 'INSURANCE',
      },
      data: { insuranceClaimStatus: status },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'UPDATE_CLAIM_STATUS',
      entity: 'insurance_claim',
      details: JSON.stringify({ count: result.count, status, sampleIds: saleIds.slice(0, 5) }),
    })

    return NextResponse.json({ updated: result.count })
  } catch (error) {
    console.error('Error updating claim status:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
