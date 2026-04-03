import { prisma } from './prisma'

export interface AnomalyAlert {
  type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  details: Record<string, unknown>
}

export async function detectAnomalies(pharmacyId: string): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = []

  // 1. Sales without sufficient stock
  const recentSales = await prisma.sale.findMany({
    where: { pharmacyId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    include: { items: { include: { medication: true } }, user: true },
  })

  for (const sale of recentSales) {
    for (const item of sale.items) {
      if (item.medication.quantity < 0) {
        alerts.push({
          type: 'stock_negative',
          severity: 'critical',
          message: `Stock négatif détecté: ${item.medication.name} (${item.medication.quantity} unités)`,
          details: { medicationId: item.medicationId, saleId: sale.id, userId: sale.userId },
        })
      }
    }
  }

  // 2. Unusual sale amounts (> 3x average)
  const avgSale = await prisma.sale.aggregate({
    where: { pharmacyId },
    _avg: { total: true },
    _max: { total: true },
  })

  if (avgSale._avg.total) {
    const threshold = avgSale._avg.total * 3
    const unusualSales = recentSales.filter(s => s.total > threshold)
    for (const sale of unusualSales) {
      alerts.push({
        type: 'unusual_amount',
        severity: 'warning',
        message: `Vente inhabituellement elevee: ${sale.total} XOF par ${sale.user.firstName} ${sale.user.lastName}`,
        details: { saleId: sale.id, amount: sale.total, threshold },
      })
    }
  }

  // 3. After-hours activity
  for (const sale of recentSales) {
    const hour = sale.createdAt.getHours()
    if (hour < 7 || hour > 22) {
      alerts.push({
        type: 'after_hours',
        severity: 'warning',
        message: `Vente en dehors des heures d'ouverture à ${hour}h par ${sale.user.firstName}`,
        details: { saleId: sale.id, hour, userId: sale.userId },
      })
    }
  }

  // 4. High discount frequency
  const highDiscountSales = recentSales.filter(s => s.discount > 0 && s.discount / s.subtotal > 0.2)
  if (highDiscountSales.length > 3) {
    alerts.push({
      type: 'excessive_discounts',
      severity: 'warning',
      message: `${highDiscountSales.length} ventes avec remise >20% dans les dernières 24h`,
      details: { count: highDiscountSales.length },
    })
  }

  // 5. Voided/cancelled sales
  const cancelledCount = await prisma.sale.count({
    where: {
      pharmacyId,
      status: { in: ['refunded', 'cancelled'] },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  })
  if (cancelledCount > 5) {
    alerts.push({
      type: 'high_cancellations',
      severity: 'warning',
      message: `${cancelledCount} ventes annulées/remboursées dans les dernières 24h`,
      details: { count: cancelledCount },
    })
  }

  return alerts
}
