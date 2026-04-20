'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDashboard } from '@/components/DashboardProvider'
import { CreditCard, Loader2, Shield, RefreshCw, X, AlertCircle } from 'lucide-react'

interface SubData {
  id: string
  plan: string
  status: string
  startDate: string
  endDate: string | null
  amount: number
  autoPayEnabled: boolean
  pharmacy: { id: string; name: string; isActive: boolean; city: string | null }
  payments: Array<{ id: string; amount: number; method: string; status: string; createdAt: string; recordedBy: string | null; type: string }>
}

interface PaymentData {
  id: string
  amount: number
  method: string
  status: string
  reference: string | null
  notes: string | null
  recordedBy: string | null
  type: string
  createdAt: string
  subscription: { pharmacy: { name: string } }
}

interface ManualPaymentForm {
  subscriptionId: string
  pharmacyName: string
  amount: string
  period: 'monthly' | 'annual'
  method: 'mobile_money' | 'cash' | 'bank_transfer' | 'check'
  provider: string
  reference: string
  notes: string
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

const typeColors: Record<string, string> = {
  manual: 'bg-emerald-100 text-emerald-700',
  auto: 'bg-blue-100 text-blue-700',
  pharmacy_initiated: 'bg-gray-100 text-gray-600',
}

const typeLabels: Record<string, string> = {
  manual: 'Manuel',
  auto: 'Auto',
  pharmacy_initiated: 'Pharmacie',
}

export default function SASubscriptionsPage() {
  const { user } = useDashboard()
  const [subs, setSubs] = useState<SubData[]>([])
  const [payments, setPayments] = useState<PaymentData[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'subs' | 'payments'>('subs')
  const [paymentModal, setPaymentModal] = useState<ManualPaymentForm | null>(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [fetchError, setFetchError] = useState('')

  const fetchData = useCallback(async () => {
    setFetchError('')
    try {
      const res = await fetch('/api/superadmin/subscriptions')
      const data = await res.json()
      if (!res.ok) {
        setFetchError(data.error || `Erreur ${res.status}`)
        return
      }
      setSubs(data.subscriptions || [])
      setPayments(data.recentPayments || [])
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (user.role !== 'SUPER_ADMIN') {
    return <div className="flex items-center justify-center py-20"><Shield className="w-12 h-12 text-gray-300" /></div>
  }

  const handleAction = async (subscriptionId: string, action: string, extra?: Record<string, string>) => {
    await fetch('/api/superadmin/subscriptions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId, action, ...extra }),
    })
    fetchData()
  }

  const handleToggleAutoPay = async (subscriptionId: string, current: boolean) => {
    await fetch('/api/superadmin/subscriptions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId, action: 'toggle_autopay', autoPayEnabled: !current }),
    })
    fetchData()
  }

  const handleManualPayment = async (form: ManualPaymentForm) => {
    setPaymentLoading(true)
    setPaymentError('')
    try {
      const res = await fetch('/api/superadmin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: form.subscriptionId,
          amount: parseFloat(form.amount),
          period: form.period,
          method: form.method,
          provider: form.provider || undefined,
          reference: form.reference || undefined,
          notes: form.notes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setPaymentError(data.error || 'Erreur'); return }
      setPaymentModal(null)
      fetchData()
    } catch { setPaymentError('Impossible de contacter le serveur') }
    finally { setPaymentLoading(false) }
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

      {fetchError && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{fetchError}</span>
          <div className="ml-auto flex gap-2">
            <button onClick={fetchData} className="px-3 py-1 text-xs font-medium bg-red-100 hover:bg-red-200 rounded-lg transition-colors">
              Réessayer
            </button>
            {fetchError.toLowerCase().includes('refusé') || fetchError.toLowerCase().includes('403') ? (
              <a href="/login" className="px-3 py-1 text-xs font-medium bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors">
                Se reconnecter
              </a>
            ) : null}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : tab === 'subs' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Pharmacie</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Plan</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Statut</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Expiration</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Montant</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Auto-paiement</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subs.length === 0 && !fetchError && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                    Aucun abonnement trouvé
                  </td>
                </tr>
              )}
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
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    <button
                      onClick={() => handleToggleAutoPay(s.id, s.autoPayEnabled)}
                      title={s.autoPayEnabled ? "Désactiver l'auto-paiement" : "Activer l'auto-paiement"}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        s.autoPayEnabled ? 'bg-emerald-500' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        s.autoPayEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleAction(s.id, 'extend')} title="Prolonger 30j"
                        className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPaymentModal({
                          subscriptionId: s.id,
                          pharmacyName: s.pharmacy.name,
                          amount: '',
                          period: 'monthly',
                          method: 'mobile_money',
                          provider: '',
                          reference: '',
                          notes: '',
                        })}
                        title="Enregistrer un paiement"
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        Payer
                      </button>
                    </div>
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
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Type</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Statut</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Enregistré par</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">Aucun paiement</td></tr>
              ) : payments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.subscription.pharmacy.name}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-600">{p.method}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${typeColors[p.type] || 'bg-gray-100 text-gray-600'}`}>
                      {typeLabels[p.type] || p.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                      p.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500 hidden md:table-cell">
                    {p.recordedBy || '-'}
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

      {/* Manual payment modal */}
      {paymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Paiement manuel</h3>
                  <p className="text-xs text-gray-500">{paymentModal.pharmacyName}</p>
                </div>
              </div>
              <button onClick={() => setPaymentModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form
              onSubmit={e => { e.preventDefault(); handleManualPayment(paymentModal) }}
              className="p-5 space-y-4"
            >
              {paymentError && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl">{paymentError}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Montant (XOF) *</label>
                <input
                  type="number" min="1" required
                  value={paymentModal.amount}
                  onChange={e => setPaymentModal(f => f && ({ ...f, amount: e.target.value }))}
                  placeholder="Ex: 25000"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Période *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['monthly', 'annual'] as const).map(p => (
                    <label
                      key={p}
                      className={`flex items-center gap-2 px-3 py-2.5 border rounded-xl cursor-pointer transition-colors ${
                        paymentModal.period === p
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="period"
                        value={p}
                        checked={paymentModal.period === p}
                        onChange={() => setPaymentModal(f => f && ({ ...f, period: p }))}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {p === 'monthly' ? 'Mensuel' : 'Annuel'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {p === 'monthly' ? '+30 jours' : '+365 jours'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Méthode *</label>
                <select
                  required
                  value={paymentModal.method}
                  onChange={e => setPaymentModal(f => f && ({ ...f, method: e.target.value as ManualPaymentForm['method'] }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="mobile_money">Mobile Money</option>
                  <option value="cash">Espèces</option>
                  <option value="bank_transfer">Virement bancaire</option>
                  <option value="check">Chèque</option>
                </select>
              </div>

              {paymentModal.method === 'mobile_money' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Opérateur</label>
                  <select
                    value={paymentModal.provider}
                    onChange={e => setPaymentModal(f => f && ({ ...f, provider: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    <option value="">-- Sélectionner --</option>
                    <option value="wave">Wave</option>
                    <option value="orange_money">Orange Money</option>
                    <option value="free_money">Free Money</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Référence</label>
                <input
                  value={paymentModal.reference}
                  onChange={e => setPaymentModal(f => f && ({ ...f, reference: e.target.value }))}
                  placeholder="Ex: TXN-2026-0001 (auto-générée si vide)"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={paymentModal.notes}
                  onChange={e => setPaymentModal(f => f && ({ ...f, notes: e.target.value }))}
                  placeholder="Observations..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModal(null)}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={paymentLoading}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                >
                  {paymentLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CreditCard className="w-4 h-4" />
                  }
                  Enregistrer le paiement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
