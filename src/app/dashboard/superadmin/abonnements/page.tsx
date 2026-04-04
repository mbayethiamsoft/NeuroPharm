'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDashboard } from '@/components/DashboardProvider'
import { CreditCard, Loader2, Shield, RefreshCw } from 'lucide-react'

interface SubData {
  id: string
  plan: string
  status: string
  startDate: string
  endDate: string | null
  amount: number
  pharmacy: { id: string; name: string; isActive: boolean; city: string | null }
  payments: Array<{ id: string; amount: number; method: string; status: string; createdAt: string }>
}

interface PaymentData {
  id: string
  amount: number
  method: string
  status: string
  reference: string | null
  createdAt: string
  subscription: { pharmacy: { name: string } }
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

const planColors: Record<string, string> = {
  TRIAL: 'bg-gray-100 text-gray-700',
  BASIC: 'bg-blue-100 text-blue-700',
  PROFESSIONAL: 'bg-violet-100 text-violet-700',
  ENTERPRISE: 'bg-amber-100 text-amber-700',
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  SUSPENDED: 'bg-amber-100 text-amber-700',
  EXPIRED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-700',
}

export default function SASubscriptionsPage() {
  const { user } = useDashboard()
  const [subs, setSubs] = useState<SubData[]>([])
  const [payments, setPayments] = useState<PaymentData[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'subs' | 'payments'>('subs')

  if (user.role !== 'SUPER_ADMIN') {
    return <div className="flex items-center justify-center py-20"><Shield className="w-12 h-12 text-gray-300" /></div>
  }

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/superadmin/subscriptions')
      const data = await res.json()
      setSubs(data.subscriptions || [])
      setPayments(data.recentPayments || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { fetchData() }, [fetchData])

  const handleAction = async (subscriptionId: string, action: string, extra?: Record<string, string>) => {
    await fetch('/api/superadmin/subscriptions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId, action, ...extra }),
    })
    fetchData()
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Abonnements & Paiements</h2>
        <div className="flex gap-2">
          <button onClick={() => setTab('subs')}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${tab === 'subs' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            Abonnements
          </button>
          <button onClick={() => setTab('payments')}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${tab === 'payments' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            Paiements
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : tab === 'subs' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Pharmacie</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Plan</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Statut</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Expiration</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Montant</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subs.map(s => (
                <tr key={s.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{s.pharmacy.name}</p>
                    <p className="text-xs text-gray-500">{s.pharmacy.city || '-'}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <select value={s.plan}
                      onChange={e => handleAction(s.id, 'change_plan', { plan: e.target.value })}
                      className={`px-2 py-1 text-xs font-medium rounded-full border-0 cursor-pointer ${planColors[s.plan]}`}>
                      <option value="TRIAL">TRIAL</option>
                      <option value="BASIC">BASIC</option>
                      <option value="PROFESSIONAL">PROFESSIONAL</option>
                      <option value="ENTERPRISE">ENTERPRISE</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <select value={s.status}
                      onChange={e => handleAction(s.id, 'change_status', { status: e.target.value })}
                      className={`px-2 py-1 text-xs font-medium rounded-full border-0 cursor-pointer ${statusColors[s.status]}`}>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="EXPIRED">EXPIRED</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500 hidden md:table-cell">
                    {s.endDate ? new Date(s.endDate).toLocaleDateString('fr-FR') : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">{formatCurrency(s.amount)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleAction(s.id, 'extend')} title="Prolonger 30j"
                      className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Pharmacie</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Montant</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Méthode</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Statut</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400">Aucun paiement</td></tr>
              ) : payments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.subscription.pharmacy.name}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-600">{p.method}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                      p.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">
                    {new Date(p.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
