'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDashboard } from '@/components/DashboardProvider'
import Link from 'next/link'
import {
  Building2, Users, TrendingUp, CreditCard, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Shield, Loader2,
  Ticket, Activity, Clock,
} from 'lucide-react'

interface KPIs {
  totalPharmacies: number
  activePharmacies: number
  totalUsers: number
  activeUsers: number
  mrrThisMonth: number
  mrrLastMonth: number
  mrrGrowth: string
  activeSubs: number
  expiredSubs: number
  suspendedSubs: number
  cancelledSubs: number
  planDistribution: Record<string, number>
  churnRate: string
  conversionRate: string
  growthRate: string
  thisMonthRegistrations: number
  openTickets: number
}

interface LogEntry {
  id: string
  level: string
  action: string
  userEmail: string | null
  details: string | null
  createdAt: string
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

export default function SuperAdminDashboard() {
  const { user } = useDashboard()
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/superadmin/dashboard')
      if (res.ok) {
        const data = await res.json()
        setKpis(data.kpis)
        setRecentLogs(data.recentLogs || [])
      }
    } catch (err) {
      console.error('Failed to fetch SA dashboard:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (user.role !== 'SUPER_ADMIN') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-900">Accès restreint</h3>
          <p className="text-gray-500">Cette page est réservée aux Super Administrateurs</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  const levelColors: Record<string, string> = {
    info: 'bg-blue-100 text-blue-700',
    warning: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-700',
    critical: 'bg-red-200 text-red-800',
  }

  const planColors: Record<string, string> = {
    TRIAL: 'bg-gray-100 text-gray-700',
    BASIC: 'bg-blue-100 text-blue-700',
    PROFESSIONAL: 'bg-violet-100 text-violet-700',
    ENTERPRISE: 'bg-amber-100 text-amber-700',
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Tableau de bord SaaS
        </h1>
        <p className="text-gray-500 mt-1">Vue d&apos;ensemble de la plateforme NeuroPharm</p>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-blue-50"><Building2 className="w-5 h-5 text-blue-600" /></div>
            {kpis && Number(kpis.growthRate) > 0 && (
              <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600">
                <ArrowUpRight className="w-3 h-3" />+{kpis.growthRate}%
              </span>
            )}
          </div>
          <div className="text-2xl font-bold text-gray-900">{kpis?.activePharmacies ?? '...'}</div>
          <p className="text-sm text-gray-500">Pharmacies actives</p>
          <p className="text-xs text-gray-400 mt-1">{kpis?.totalPharmacies} total</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-emerald-50"><Users className="w-5 h-5 text-emerald-600" /></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{kpis?.activeUsers ?? '...'}</div>
          <p className="text-sm text-gray-500">Utilisateurs actifs</p>
          <p className="text-xs text-gray-400 mt-1">{kpis?.totalUsers} total</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-violet-50"><TrendingUp className="w-5 h-5 text-violet-600" /></div>
            {kpis && Number(kpis.mrrGrowth) !== 0 && (
              <span className={`flex items-center gap-0.5 text-xs font-medium ${Number(kpis.mrrGrowth) > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {Number(kpis.mrrGrowth) > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {kpis.mrrGrowth}%
              </span>
            )}
          </div>
          <div className="text-2xl font-bold text-gray-900">{kpis ? formatCurrency(kpis.mrrThisMonth) : '...'}</div>
          <p className="text-sm text-gray-500">MRR (ce mois)</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-amber-50"><CreditCard className="w-5 h-5 text-amber-600" /></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{kpis?.activeSubs ?? '...'}</div>
          <p className="text-sm text-gray-500">Abonnements actifs</p>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Taux de conversion</p>
          <p className="text-3xl font-bold text-emerald-600">{kpis?.conversionRate ?? '0'}%</p>
          <p className="text-xs text-gray-400 mt-1">Essai vers abonnement payant</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Taux de churn</p>
          <p className="text-3xl font-bold text-red-600">{kpis?.churnRate ?? '0'}%</p>
          <p className="text-xs text-gray-400 mt-1">Résiliations / expirations</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Nouvelles inscriptions</p>
          <p className="text-3xl font-bold text-blue-600">{kpis?.thisMonthRegistrations ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">Ce mois-ci</p>
        </div>
      </div>

      {/* Distribution & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plan distribution */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Distribution des plans</h3>
          </div>
          <div className="p-5 space-y-3">
            {kpis && Object.entries(kpis.planDistribution).map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between">
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${planColors[plan] || 'bg-gray-100 text-gray-700'}`}>
                  {plan}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${kpis.totalPharmacies > 0 ? (count / kpis.totalPharmacies) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="p-5 border-t border-gray-100 space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Suspendus</span><span className="font-medium text-amber-600">{kpis?.suspendedSubs ?? 0}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Expirés</span><span className="font-medium text-red-600">{kpis?.expiredSubs ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Accès rapide</h3>
          </div>
          <div className="p-5 space-y-3">
            {[
              { label: 'Pharmacies', href: '/dashboard/superadmin/pharmacies', icon: Building2, color: 'bg-blue-600 hover:bg-blue-700' },
              { label: 'Utilisateurs', href: '/dashboard/superadmin/utilisateurs', icon: Users, color: 'bg-emerald-600 hover:bg-emerald-700' },
              { label: 'Abonnements', href: '/dashboard/superadmin/abonnements', icon: CreditCard, color: 'bg-violet-600 hover:bg-violet-700' },
              { label: 'Logs système', href: '/dashboard/superadmin/logs', icon: Activity, color: 'bg-slate-600 hover:bg-slate-700' },
              { label: 'Support', href: '/dashboard/superadmin/support', icon: Ticket, color: 'bg-amber-600 hover:bg-amber-700' },
            ].map(a => (
              <Link key={a.href} href={a.href}
                className={`flex items-center gap-3 w-full p-3 rounded-xl text-white text-sm font-medium ${a.color} transition-colors`}>
                <a.icon className="w-4 h-4" />{a.label}
              </Link>
            ))}
          </div>
          {(kpis?.openTickets ?? 0) > 0 && (
            <div className="p-5 border-t border-gray-100">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">
                    {kpis?.openTickets} ticket(s) de support ouvert(s)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recent logs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Activité récente</h3>
            <Link href="/dashboard/superadmin/logs" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
              Voir tout
            </Link>
          </div>
          <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {recentLogs.length === 0 ? (
              <div className="p-5 text-center text-sm text-gray-400">Aucune activité</div>
            ) : recentLogs.map(log => (
              <div key={log.id} className="px-5 py-3">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded ${levelColors[log.level] || levelColors.info}`}>
                    {log.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900">{log.action}</p>
                    {log.details && <p className="text-xs text-gray-500 mt-0.5 truncate">{log.details}</p>}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                      <Clock className="w-3 h-3" />
                      {new Date(log.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {log.userEmail && <span>• {log.userEmail}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
