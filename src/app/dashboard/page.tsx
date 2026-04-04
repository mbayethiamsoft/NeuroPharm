'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDashboard } from '@/components/DashboardProvider'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  salesYesterday: number
  salesAmountYesterday: number
  totalMedications: number
  lowStockCount: number
  monthlyRevenue: number
  lastMonthRevenue: number
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
  const { user, isImpersonating } = useDashboard()
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [welcomeMsg, setWelcomeMsg] = useState('')

  // Redirect SuperAdmin to their dedicated dashboard (unless impersonating)
  useEffect(() => {
    if (user.role === 'SUPER_ADMIN' && !isImpersonating) {
      router.replace('/dashboard/superadmin')
    }
  }, [user.role, isImpersonating, router])

  // Personalized welcome based on first/returning login
  useEffect(() => {
    try {
      const flag = sessionStorage.getItem('neuropharm-first-login')
      if (flag === '1') {
        setWelcomeMsg(`Bienvenue sur NeuroPharm, ${user.firstName} !`)
      } else if (flag === '0') {
        setWelcomeMsg(`Bon retour, ${user.firstName} !`)
      } else {
        setWelcomeMsg(`Bonjour, ${user.firstName}`)
      }
      // Clear after reading so it only shows once
      sessionStorage.removeItem('neuropharm-first-login')
    } catch {
      setWelcomeMsg(`Bonjour, ${user.firstName}`)
    }
  }, [user.firstName])

  const fetchStats = useCallback(async () => {
    try {
      const [salesRes, stockRes] = await Promise.all([
        fetch('/api/sales?limit=10'),
        fetch('/api/stock'),
      ])
      const salesData = await salesRes.json()
      const stockData = await stockRes.json()

      const now = new Date()
      const today = now.toISOString().split('T')[0]
      const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0]
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`

      const allSales = salesData.sales || []
      const todaySales = allSales.filter((s: { createdAt: string }) => s.createdAt.startsWith(today))
      const yesterdaySales = allSales.filter((s: { createdAt: string }) => s.createdAt.startsWith(yesterday))
      const thisMonthSales = allSales.filter((s: { createdAt: string }) => s.createdAt.startsWith(thisMonth))
      const lastMonthSales = allSales.filter((s: { createdAt: string }) => s.createdAt.startsWith(lastMonth))

      setStats({
        salesToday: todaySales.length,
        salesAmount: todaySales.reduce((sum: number, s: { total: number }) => sum + s.total, 0),
        salesYesterday: yesterdaySales.length,
        salesAmountYesterday: yesterdaySales.reduce((sum: number, s: { total: number }) => sum + s.total, 0),
        totalMedications: stockData.stats?.totalProducts || 0,
        lowStockCount: stockData.stats?.lowStock || 0,
        monthlyRevenue: thisMonthSales.reduce((sum: number, s: { total: number }) => sum + s.total, 0),
        lastMonthRevenue: lastMonthSales.reduce((sum: number, s: { total: number }) => sum + s.total, 0),
        recentSales: allSales.slice(0, 5),
      })
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [fetchStats])

  // Listen for custom sale event to refresh immediately
  useEffect(() => {
    const handleSaleComplete = () => fetchStats()
    window.addEventListener('neuropharm:sale-complete', handleSaleComplete)
    return () => window.removeEventListener('neuropharm:sale-complete', handleSaleComplete)
  }, [fetchStats])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(amount)

  const calcTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? '+100%' : '0%'
    const pct = ((current - previous) / previous) * 100
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`
  }

  const saleTrend = stats ? calcTrend(stats.salesToday, stats.salesYesterday) : ''
  const revenueTrend = stats ? calcTrend(stats.monthlyRevenue, stats.lastMonthRevenue) : ''

  const statCards = [
    {
      title: 'Ventes du jour',
      value: stats ? stats.salesToday.toString() : '...',
      subtitle: stats ? formatCurrency(stats.salesAmount) : '',
      icon: ShoppingCart,
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
      trend: saleTrend,
      trendUp: stats ? stats.salesToday >= stats.salesYesterday : true,
    },
    {
      title: 'Médicaments en stock',
      value: stats ? stats.totalMedications.toString() : '...',
      subtitle: 'produits actifs',
      icon: Pill,
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-600',
      trend: '',
      trendUp: true,
    },
    {
      title: 'Alertes stock bas',
      value: stats ? stats.lowStockCount.toString() : '...',
      subtitle: 'produits à réapprovisionner',
      icon: AlertTriangle,
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-600',
      trend: stats?.lowStockCount ? `${stats.lowStockCount} alertes` : '',
      trendUp: false,
    },
    {
      title: "Chiffre d'affaires",
      value: stats ? formatCurrency(stats.monthlyRevenue) : '...',
      subtitle: 'ce mois',
      icon: TrendingUp,
      bgColor: 'bg-violet-50',
      textColor: 'text-violet-600',
      trend: revenueTrend,
      trendUp: stats ? stats.monthlyRevenue >= stats.lastMonthRevenue : true,
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {welcomeMsg}
          </h1>
          <p className="text-gray-500 mt-1">
            Voici le résumé de votre pharmacie aujourd&apos;hui
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
            <h3 className="font-semibold text-gray-900">Ventes récentes</h3>
            <Link href="/dashboard/ventes" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
              Voir tout →
            </Link>
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
                <p>Aucune vente récente</p>
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
              { label: 'Ajouter médicament', href: '/dashboard/medicaments', icon: Pill, color: 'bg-blue-600 hover:bg-blue-700' },
              { label: 'Gérer le stock', href: '/dashboard/stock', icon: Package, color: 'bg-amber-600 hover:bg-amber-700' },
              { label: 'Voir les alertes', href: '/dashboard/anomalies', icon: AlertTriangle, color: 'bg-red-600 hover:bg-red-700' },
            ].map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className={`flex items-center gap-3 w-full p-3 rounded-xl text-white text-sm font-medium ${action.color} transition-colors`}
              >
                <action.icon className="w-4 h-4" />
                {action.label}
              </Link>
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
