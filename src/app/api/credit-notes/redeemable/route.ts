import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { deriveCreditNoteStatus } from '@/lib/credit-note'

// GET /api/credit-notes/redeemable?search=...
//
// Endpoint dédié au POS : retourne uniquement les avoirs « réutilisables »
// (non annulés, non expirés, solde restant > 0). On accepte une recherche par
// n° d'avoir (8 derniers car. du cuid), nom client, ou téléphone — comme le
// reste de l'app — et on plafonne dur à 25 résultats pour éviter de polluer
// le dropdown de la caisse.
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim() || ''
    const customerId = searchParams.get('customerId')?.trim() || ''

    const now = new Date()
    const where: Record<string, unknown> = {
      pharmacyId: session.pharmacyId,
      status: { not: 'cancelled' },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    }

    // On combine le filtre "search" en AND avec les autres conditions (sinon
    // le OR du dessus est écrasé). Prisma préfère une expression AND explicite.
    const filters: Record<string, unknown>[] = []
    if (customerId) filters.push({ customerId })
    if (search) {
      filters.push({
        OR: [
          { id: { endsWith: search.toLowerCase() } },
          { customerName: { contains: search, mode: 'insensitive' } },
          { customerPhone: { contains: search } },
        ],
      })
    }
    if (filters.length > 0) where.AND = filters

    const rows = await prisma.creditNote.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
      },
    })

    // Filtre solde restant > 0 (pas exprimable en SQL Prisma sans raw query
    // car on compare deux colonnes ; on filtre côté Node, c'est borné à 25).
    const enriched = rows
      .map((cn) => {
        const remaining = Math.max(0, cn.amount - cn.usedAmount)
        const effectiveStatus = deriveCreditNoteStatus({
          amount: cn.amount,
          usedAmount: cn.usedAmount,
          expiresAt: cn.expiresAt,
          status: cn.status,
        })
        return { ...cn, remaining, effectiveStatus }
      })
      .filter((cn) => cn.remaining > 0.009 && cn.effectiveStatus !== 'expired')

    return NextResponse.json({ creditNotes: enriched })
  } catch (error) {
    console.error('Error fetching redeemable credit notes:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
