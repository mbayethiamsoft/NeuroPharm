'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2, Building2, Settings, CreditCard, X, CheckCircle } from 'lucide-react'

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

const planAmounts: Record<string, number> = {
  TRIAL: 0,
  BASIC: 15000,
  PROFESSIONAL: 35000,
  ENTERPRISE: 75000,
}

export default function ParametresPage() {
  const [tab, setTab] = useState<'pharmacy' | 'settings' | 'subscription'>('pharmacy')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pharmacy, setPharmacy] = useState({ name: '', address: '', city: '', phone: '', email: '', taxId: '' })
  const [settings, setSettings] = useState({ taxRate: 0, lowStockThreshold: 10, expiryAlertDays: 30, receiptHeader: '', receiptFooter: '' })
  const [subscription, setSubscription] = useState<{ plan: string; status: string; endDate: string | null } | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('wave')
  const [paying, setPaying] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState<{ reference: string; newEndDate: string } | null>(null)
  const [payments, setPayments] = useState<Array<{ id: string; amount: number; method: string; reference: string; status: string; paidAt: string }>>([])

  useEffect(() => {
    setLoading(true)
    fetch('/api/settings').then(r => r.json()).then(data => {
      if (data.pharmacy) setPharmacy({
        name: data.pharmacy.name || '', address: data.pharmacy.address || '',
        city: data.pharmacy.city || '', phone: data.pharmacy.phone || '',
        email: data.pharmacy.email || '', taxId: data.pharmacy.taxId || '',
      })
      if (data.settings) setSettings({
        taxRate: data.settings.taxRate || 0, lowStockThreshold: data.settings.lowStockThreshold || 10,
        expiryAlertDays: data.settings.expiryAlertDays || 30,
        receiptHeader: data.settings.receiptHeader || '', receiptFooter: data.settings.receiptFooter || '',
      })
      if (data.subscription) setSubscription(data.subscription)
      setLoading(false)
    })
  }, [])

  const fetchPayments = () => {
    fetch('/api/payments').then(r => r.json()).then(d => setPayments(d.payments || []))
  }

  const handleSave = async () => {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pharmacy, settings }),
    })
    setSaving(false)
  }

  const handlePayment = async () => {
    if (!subscription) return
    const amount = planAmounts[subscription.plan] || 0
    if (amount === 0) return
    setPaying(true)
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: paymentMethod, amount }),
      })
      const data = await res.json()
      if (res.ok) {
        setPaymentSuccess({ reference: data.reference, newEndDate: data.newEndDate })
        // Refresh subscription
        fetch('/api/settings').then(r => r.json()).then(d => {
          if (d.subscription) setSubscription(d.subscription)
        })
        fetchPayments()
      }
    } catch { /* silent */ } finally {
      setPaying(false)
    }
  }

  const plans = [
    { name: 'Essai', key: 'TRIAL', price: 'Gratuit', duration: '14 jours', features: ['1 utilisateur', 'Fonctions de base', 'Support email'] },
    { name: 'Basique', key: 'BASIC', price: '15 000 XOF/mois', duration: '', features: ['5 utilisateurs', 'Toutes les fonctions', 'Support prioritaire', 'Rapports'] },
    { name: 'Professionnel', key: 'PROFESSIONAL', price: '35 000 XOF/mois', duration: '', features: ['15 utilisateurs', 'Détection anomalies', 'Accès API', 'Support 24/7', 'Multi-sites'] },
    { name: 'Entreprise', key: 'ENTERPRISE', price: 'Sur devis', duration: '', features: ['Utilisateurs illimités', 'IA prédictive', 'Intégrations custom', 'SLA garanti', 'Formation'] },
  ]

  const paymentMethods = [
    { key: 'wave', label: 'Wave', color: 'bg-blue-500', desc: 'Paiement mobile Wave' },
    { key: 'orange_money', label: 'Orange Money', color: 'bg-orange-500', desc: 'Paiement mobile Orange' },
    { key: 'card', label: 'Carte bancaire', color: 'bg-slate-700', desc: 'Visa / Mastercard' },
  ]

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { key: 'pharmacy', label: 'Pharmacie', icon: Building2 },
          { key: 'settings', label: 'Paramètres', icon: Settings },
          { key: 'subscription', label: 'Abonnement', icon: CreditCard },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key as typeof tab); if (t.key === 'subscription') fetchPayments() }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'pharmacy' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl">
          <h3 className="font-semibold text-gray-900 mb-4">Informations de la pharmacie</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'Nom', key: 'name' },
              { label: 'Adresse', key: 'address' },
              { label: 'Ville', key: 'city' },
              { label: 'Téléphone', key: 'phone' },
              { label: 'Email', key: 'email', type: 'email' },
              { label: 'Numéro fiscal', key: 'taxId' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <input type={f.type || 'text'} value={pharmacy[f.key as keyof typeof pharmacy]}
                  onChange={e => setPharmacy(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
            ))}
          </div>
          <button onClick={handleSave} disabled={saving}
            className="mt-6 flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
          </button>
        </div>
      )}

      {tab === 'settings' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl">
          <h3 className="font-semibold text-gray-900 mb-4">Paramètres généraux</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Taux de taxe (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={settings.taxRate}
                onChange={e => setSettings(s => ({ ...s, taxRate: parseFloat(e.target.value) || 0 }))}
                className="w-full max-w-xs px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seuil de stock bas</label>
              <input type="number" min="1" value={settings.lowStockThreshold}
                onChange={e => setSettings(s => ({ ...s, lowStockThreshold: parseInt(e.target.value) || 10 }))}
                className="w-full max-w-xs px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Jours d&apos;alerte expiration</label>
              <input type="number" min="1" value={settings.expiryAlertDays}
                onChange={e => setSettings(s => ({ ...s, expiryAlertDays: parseInt(e.target.value) || 30 }))}
                className="w-full max-w-xs px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">En-tête du reçu</label>
              <textarea value={settings.receiptHeader} onChange={e => setSettings(s => ({ ...s, receiptHeader: e.target.value }))}
                rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pied de page du reçu</label>
              <textarea value={settings.receiptFooter} onChange={e => setSettings(s => ({ ...s, receiptFooter: e.target.value }))}
                rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="mt-6 flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
          </button>
        </div>
      )}

      {tab === 'subscription' && (
        <div className="space-y-6">
          {subscription && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Abonnement actuel</h3>
                {subscription.plan !== 'TRIAL' && planAmounts[subscription.plan] > 0 && (
                  <button onClick={() => { setShowPayment(true); setPaymentSuccess(null) }}
                    className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors">
                    Payer
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-500">Plan</span><span className="font-medium">{subscription.plan}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Statut</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${subscription.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {subscription.status === 'ACTIVE' ? 'Actif' : subscription.status}
                  </span>
                </div>
                {subscription.endDate && (
                  <div className="flex justify-between"><span className="text-gray-500">Expire le</span><span>{new Date(subscription.endDate).toLocaleDateString('fr-FR')}</span></div>
                )}
                {planAmounts[subscription.plan] > 0 && (
                  <div className="flex justify-between"><span className="text-gray-500">Montant mensuel</span><span className="font-semibold text-emerald-600">{formatCurrency(planAmounts[subscription.plan])}</span></div>
                )}
              </div>
            </div>
          )}

          {/* Payment history */}
          {payments.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden max-w-lg">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Historique des paiements</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {payments.slice(0, 5).map(p => (
                  <div key={p.id} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-gray-500">{p.reference} • {p.method}</p>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">Payé</span>
                      <p className="text-xs text-gray-400 mt-1">{new Date(p.paidAt).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map(plan => (
              <div key={plan.key} className={`bg-white rounded-2xl border shadow-sm p-5 ${subscription?.plan === plan.key ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-gray-100'}`}>
                <h4 className="font-semibold text-gray-900">{plan.name}</h4>
                <p className="text-lg font-bold text-emerald-600 mt-1">{plan.price}</p>
                {plan.duration && <p className="text-xs text-gray-500">{plan.duration}</p>}
                <ul className="mt-4 space-y-2">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> {f}
                    </li>
                  ))}
                </ul>
                <button className={`w-full mt-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                  subscription?.plan === plan.key
                    ? 'bg-emerald-100 text-emerald-700 cursor-default'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}>
                  {subscription?.plan === plan.key ? 'Plan actuel' : 'Choisir'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && subscription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold">Paiement de l&apos;abonnement</h3>
              <button onClick={() => setShowPayment(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>

            {paymentSuccess ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </div>
                <h4 className="text-xl font-bold text-gray-900">Paiement réussi !</h4>
                <p className="text-gray-500 mt-2">Votre abonnement a été renouvelé.</p>
                <div className="mt-4 p-3 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-600">Référence: <span className="font-mono font-bold text-emerald-600">{paymentSuccess.reference}</span></p>
                  <p className="text-sm text-gray-600 mt-1">Valide jusqu&apos;au: <span className="font-medium">{new Date(paymentSuccess.newEndDate).toLocaleDateString('fr-FR')}</span></p>
                </div>
                <button onClick={() => setShowPayment(false)}
                  className="mt-4 px-6 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700">
                  Fermer
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-5">
                <div className="p-4 bg-emerald-50 rounded-xl text-center">
                  <p className="text-sm text-gray-600">Montant à payer</p>
                  <p className="text-3xl font-bold text-emerald-600 mt-1">{formatCurrency(planAmounts[subscription.plan] || 0)}</p>
                  <p className="text-xs text-gray-500 mt-1">Plan {subscription.plan} — 30 jours</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Mode de paiement</label>
                  <div className="space-y-2">
                    {paymentMethods.map(pm => (
                      <button key={pm.key} onClick={() => setPaymentMethod(pm.key)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                          paymentMethod === pm.key ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                        }`}>
                        <div className={`w-10 h-10 rounded-lg ${pm.color} flex items-center justify-center text-white text-xs font-bold`}>
                          {pm.label.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-900">{pm.label}</p>
                          <p className="text-xs text-gray-500">{pm.desc}</p>
                        </div>
                        {paymentMethod === pm.key && (
                          <CheckCircle className="w-5 h-5 text-emerald-500 ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={handlePayment} disabled={paying}
                  className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                  {paying ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                  {paying ? 'Traitement...' : 'Confirmer le paiement'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
