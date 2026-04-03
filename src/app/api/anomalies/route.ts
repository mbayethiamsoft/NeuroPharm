import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { detectAnomalies } from '@/lib/anomaly'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.pharmacyId) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const [anomalies, suspiciousLogs] = await Promise.all([
      detectAnomalies(session.pharmacyId),
      prisma.auditLog.findMany({
        where: { pharmacyId: session.pharmacyId, isSuspicious: true },
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

    return NextResponse.json({
      anomalies,
      suspiciousLogs,
      stats: {
        totalAlerts: anomalies.length,
        critical: anomalies.filter(a => a.severity === 'critical').length,
        suspicious: suspiciousLogs.length,
      },
    })
  } catch (error) {
    console.error('Anomalies GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
