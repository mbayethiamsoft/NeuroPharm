'use client'

import { useState, useEffect } from 'react'
import { useDashboard } from '@/components/DashboardProvider'
import {
  ShoppingCart,
  Pill,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  Clock,
} from 'lucide-react'

interface DashboardStats {
  salesToday: number
  salesAmount: number
  totalMedications: number
  lowStockCount: number
  monthlyRevenue: number
  recentSales: Array<{
    id: string
    total: number
    createdAt: string
    user: { firstName: string; lastName: string }
    _count: { items: number }
    paymentMethod: string
  }>
}

export default function DashboardPage() {
  const { user } = useDashboard()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const [salesRes, stockRes] = await Promise.all([
          fetch('/api/sales?limit=5'),
          fetch('/api/stock'),
        ])
        const salesData = await salesRes.json()
        const stockData = await stockRes.json()

        const today = new Date().toISOString().split('T')[0]
        const todaySales = salesData.sales?.filter((s: { createdAt: string }) =>
          s.createdAt.startsWith(today)
        ) || []

        setStats({
          salesToday: todaySales.length,
          salesAmount: todaySales.reduce((sum: number, s: { total: number }) => sum + s.total, 0),
          totalMedications: stockData.stats?.totalProducts || 0,
          lowStockCount: stockData.stats?.lowStock || 0,
          monthlyRevenue: salesData.sales?.reduce((sum: number, s: { total: number }) => sum + s.total, 0) || 0,
          recentSales: salesData.sales || [],
        })
      } catch (error) {
        console.error('Failed to fetch stats:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(amount)

  const statCards = [
    {
      title: 'Ventes du jour',
      value: stats ? stats.salesToday.toString() : '...',
      subtitle: stats ? formatCurrency(stats.salesAmount) : '',
      icon: ShoppingCart,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
      trend: '+12%',
      trendUp: true,
    },
    {
      title: 'Medicaments en stock',
      value: stats ? stats.totalMedications.toString() : '...',
      subtitle: 'produits actifs',
      icon: Pill,
      color: 'from-emerald-500 to-emerald-600',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-600',
      trend: '+3',
      trendUp: true,
    },
    {
      title: 'Alertes stock bas',
      value: stats ? stats.lowStockCount.toString() : '...',
      subtitle: 'produits a reapprovisionner',
      icon: AlertTriangle,
      color: 'from-amber-500 to-orange-500',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-600',
      trend: stats?.lowStockCount ? `${stats.lowStockCount} alertes` : '',
      trendUp: false,
    },
    {
      title: 'Chiffre d\'affaires',
      value: stats ? formatCurrency(stats.monthlyRevenue) : '...',
      subtitle: 'ce mois',
      icon: TrendingUp,
      color: 'from-violet-500 to-purple-600',
      bgColor: 'bg-violet-50',
      textColor: 'text-violet-600',
      trend: '+8%',
      trendUp: true,
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bonjour, {user.firstName} 👋
          </h1>
          <p className="text-gray-500 mt-1">
            Voici le resume de votre pharmacie aujourd&apos;hui
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500">
          <Clock className="w-4 h-4" />
          {new Date().toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.title}
            className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2.5 rounded-xl ${card.bgColor}`}>
                <card.icon className={`w-5 h-5 ${card.textColor}`} />
              </div>
              {card.trend && (
                <span className={`flex items-center gap-0.5 text-xs font-medium ${card.trendUp ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {card.trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {card.trend}
                </span>
              )}
            </div>
            <div className="text-2xl font-bold text-gray-900">{loading ? '...' : card.value}</div>
            <p className="text-sm text-gray-500 mt-0.5">{card.subtitle}</p>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Sales */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Ventes recentes</h3>
            <a href="/dashboard/ventes" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
              Voir tout →
            </a>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : stats?.recentSales && stats.recentSales.length > 0 ? (
              <div className="space-y-3">
                {stats.recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                        <ShoppingCart className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {sale.user.firstName} {sale.user.lastName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {sale._count.items} article{sale._count.items > 1 ? 's' : ''} • {sale.paymentMethod}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(sale.total)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(sale.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>Aucune vente recente</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Actions rapides</h3>
          </div>
          <div className="p-5 space-y-3">
            {[
              { label: 'Nouvelle vente', href: '/dashboard/ventes', icon: ShoppingCart, color: 'bg-emerald-600 hover:bg-emerald-700' },
              { label: 'Ajouter medicament', href: '/dashboard/medicaments', icon: Pill, color: 'bg-blue-600 hover:bg-blue-700' },
              { label: 'Gerer le stock', href: '/dashboard/stock', icon: Package, color: 'bg-amber-600 hover:bg-amber-700' },
              { label: 'Voir les alertes', href: '/dashboard/anomalies', icon: AlertTriangle, color: 'bg-red-600 hover:bg-red-700' },
            ].map((action) => (
              <a
                key={action.label}
                href={action.href}
                className={`flex items-center gap-3 w-full p-3 rounded-xl text-white text-sm font-medium ${action.color} transition-colors`}
              >
                <action.icon className="w-4 h-4" />
                {action.label}
              </a>
            ))}
          </div>

          {/* Stock alerts preview */}
          <div className="p-5 border-t border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Alertes stock</h4>
            {stats?.lowStockCount ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">
                    {stats.lowStockCount} produit{stats.lowStockCount > 1 ? 's' : ''} en stock bas
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Aucune alerte</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
