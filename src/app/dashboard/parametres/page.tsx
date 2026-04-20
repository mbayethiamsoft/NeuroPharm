'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2, Building2, Settings, CreditCard, X, CheckCircle, ArrowRight, AlertCircle, Smartphone, Clock } from 'lucide-react'

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

const planAmounts: Record<string, number> = {
  TRIAL: 0,
  BASIC: 15000,
  PROFESSIONAL: 35000,
  ENTERPRISE: 75000,
}

const planAnnualAmounts: Record<string, number> = {
  TRIAL: 0,
  BASIC: 150000,
  PROFESSIONAL: 350000,
  ENTERPRISE: 0,
}

export default function ParametresPage() {
  const [tab, setTab] = useState<'pharmacy' | 'settings' | 'subscription'>('pharmacy')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pharmacy, setPharmacy] = useState({ name: '', address: '', city: '', phone: '', email: '', taxId: '' })
  const [settings, setSettings] = useState({ taxRate: 0, lowStockThreshold: 10, expiryAlertDays: 30, receiptHeader: '', receiptFooter: '' })
  const [subscription, setSubscription] = useState<{ plan: string; status: string; endDate: string | null } | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly')
  const [initiating, setInitiating] = useState(false)
  const [pendingPayment, setPendingPayment] = useState<{ reference: string; expiresAt: string } | null>(null)
  const [payments, setPayments] = useState<Array<{ id: string; amount: number; method: string; provider?: string; reference: string; status: string; period: string; paidAt: string }>>([])
  const [pendingPlan, setPendingPlan] = useState<string | null>(null)
  const [changingPlan, setChangingPlan] = useState(false)
  const [planChangeError, setPlanChangeError] = useState('')

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

  const refreshSubscription = () => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      if (d.subscription) setSubscription(d.subscription)
    })
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

  const handleInitiateWavePayment = async (targetPlan?: string) => {
    const activePlan = targetPlan || subscription?.plan
    if (!activePlan) return
    setInitiating(true)

    // Ouvrir la fenêtre IMMÉDIATEMENT (avant tout await) pour éviter le blocage popup
    const newTab = window.open('', '_blank')
    if (!newTab) {
      alert("Votre navigateur a bloqué l'ouverture d'un nouvel onglet. Autorisez les popups pour ce site.")
      setInitiating(false)
      return
    }
    // Page de chargement temporaire pendant que la session est créée
    newTab.document.write('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f4ff"><p style="color:#1A73E8;font-size:1.1rem">Génération du QR code Wave…</p></body></html>')

    try {
      const res = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: billingPeriod, method: 'wave', plan: activePlan }),
      })
      const data = await res.json()
      if (!res.ok) {
        newTab.close()
        alert(data.error || "Erreur lors de l'initiation du paiement")
        return
      }

      const amount = billingPeriod === 'annual'
        ? (planAnnualAmounts[activePlan] || 0)
        : (planAmounts[activePlan] || 0)

      const params = new URLSearchParams({
        session: data.sessionToken,
        amount: String(amount),
        ref: data.reference,
        period: billingPeriod,
        plan: activePlan,
        pharmacy: pharmacy.name,
        expires: data.expiresAt,
      })

      // Naviguer l'onglet déjà ouvert vers la page Wave
      newTab.location.href = `/dashboard/paiement-wave?${params.toString()}`

      setPendingPayment({ reference: data.reference, expiresAt: data.expiresAt })
      setShowPayment(false)

      setTimeout(() => {
        refreshSubscription()
        fetchPayments()
      }, 15000)
    } catch {
      newTab.close()
      alert('Erreur de connexion')
    } finally {
      setInitiating(false)
    }
  }

  const handleChangePlan = async () => {
    if (!pendingPlan) return
    // Capturer la valeur avant tout setState — la closure React conserve la
    // valeur de rendu, mais une const explicite rend l'intention non ambiguë.
    const planToActivate = pendingPlan

    setChangingPlan(true)
    setPlanChangeError('')

    const newPlanPrice = billingPeriod === 'annual'
      ? (planAnnualAmounts[planToActivate] || 0)
      : (planAmounts[planToActivate] || 0)
    const needsPayment = newPlanPrice > 0 && planToActivate !== 'ENTERPRISE'

    // Ouvrir l'onglet Wave AVANT tout await (contournement du popup blocker)
    let waveTab: Window | null = null
    if (needsPayment) {
      waveTab = window.open('', '_blank')
      if (!waveTab) {
        alert("Votre navigateur a bloqué l'ouverture d'un nouvel onglet. Autorisez les popups pour ce site.")
        setChangingPlan(false)
        return
      }
      waveTab.document.write('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f4ff"><p style="color:#1A73E8;font-size:1.1rem">Changement de plan et génération du QR Wave…</p></body></html>')
    }

    try {
      // 1. Changer le plan en DB
      const res = await fetch('/api/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planToActivate }),
      })
      const data = await res.json()
      if (!res.ok) {
        waveTab?.close()
        setPlanChangeError(data.error || 'Erreur lors du changement de plan')
        return
      }

      setSubscription(prev => prev ? { ...prev, plan: planToActivate } : prev)
      setPendingPlan(null)

      // 2. Si plan payant, initier la session Wave
      // L'API /payments/initiate relit le plan depuis la DB (déjà à jour après le PATCH).
      if (needsPayment) {
        const res2 = await fetch('/api/payments/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ period: billingPeriod, method: 'wave' }),
        })
        const data2 = await res2.json()
        if (res2.ok && waveTab) {
          const params = new URLSearchParams({
            session: data2.sessionToken,
            amount: String(newPlanPrice),
            ref: data2.reference,
            period: billingPeriod,
            plan: planToActivate,
            pharmacy: pharmacy.name,
            expires: data2.expiresAt,
          })
          waveTab.location.href = `/dashboard/paiement-wave?${params.toString()}`
          setPendingPayment({ reference: data2.reference, expiresAt: data2.expiresAt })
          setTimeout(() => { refreshSubscription(); fetchPayments() }, 15000)
        } else {
          waveTab?.close()
          if (!res2.ok) {
            setPlanChangeError(data2.error || 'Erreur lors de la génération du QR Wave')
          }
        }
      }
    } catch {
      waveTab?.close()
      setPlanChangeError('Erreur de connexion')
    } finally {
      setChangingPlan(false)
    }
  }

  const plans = [
    { name: 'Essai', key: 'TRIAL', monthly: 0, annual: 0, freeText: 'Gratuit', duration: '14 jours', features: ['1 utilisateur', 'Fonctions de base', 'Support email'] },
    { name: 'Basique', key: 'BASIC', monthly: 15000, annual: 150000, duration: '', features: ['5 utilisateurs', 'Toutes les fonctions', 'Support prioritaire', 'Rapports'] },
    { name: 'Professionnel', key: 'PROFESSIONAL', monthly: 35000, annual: 350000, duration: '', features: ['15 utilisateurs', 'Détection anomalies', 'Accès API', 'Support 24/7', 'Multi-sites'] },
    { name: 'Entreprise', key: 'ENTERPRISE', monthly: 75000, annual: 0, freeText: 'Sur devis', duration: '', features: ['Utilisateurs illimités', 'IA prédictive', 'Intégrations custom', 'SLA garanti', 'Formation'] },
  ]

  const paymentMethods = [
    { key: 'wave', label: 'Wave', icon: '🌊', color: 'bg-blue-600', desc: 'Paiement mobile Wave', available: true },
    { key: 'orange_money', label: 'Orange Money', icon: '🟠', color: 'bg-orange-500', desc: 'Bientôt disponible', available: false },
    { key: 'card', label: 'Carte bancaire', icon: '💳', color: 'bg-slate-700', desc: 'Bientôt disponible', available: false },
  ]

  const currentAmount = subscription
    ? billingPeriod === 'annual'
      ? (planAnnualAmounts[subscription.plan] || 0)
      : (planAmounts[subscription.plan] || 0)
    : 0

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
                  <button onClick={() => setShowPayment(true)}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4" /> Payer via Wave
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
                  <div className="flex justify-between"><span className="text-gray-500">Tarif mensuel</span><span className="font-semibold text-emerald-600">{formatCurrency(planAmounts[subscription.plan])}</span></div>
                )}
              </div>

              {/* Paiement en attente */}
              {pendingPayment && (
                <div className="mt-4 p-3 bg-blue-50 rounded-xl flex items-start gap-2 text-sm text-blue-700">
                  <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Paiement Wave en attente</p>
                    <p className="text-xs mt-0.5">Réf. {pendingPayment.reference} — complétez le paiement dans l&apos;onglet Wave ouvert.</p>
                  </div>
                  <button onClick={() => { setPendingPayment(null); refreshSubscription(); fetchPayments() }}
                    className="ml-auto text-blue-400 hover:text-blue-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Toggle période */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            <button onClick={() => setBillingPeriod('monthly')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${billingPeriod === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              Mensuel
            </button>
            <button onClick={() => setBillingPeriod('annual')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${billingPeriod === 'annual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              Annuel
              <span className="px-1.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">-17%</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map(plan => {
              const isCurrent = subscription?.plan === plan.key
              const price = plan.freeText
                ? plan.freeText
                : billingPeriod === 'annual' && plan.annual > 0
                  ? formatCurrency(plan.annual)
                  : formatCurrency(plan.monthly)
              const priceSuffix = plan.freeText
                ? (plan.duration || '')
                : billingPeriod === 'annual' ? '/an' : '/mois'

              return (
                <div key={plan.key} className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col ${isCurrent ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-gray-100'}`}>
                  {isCurrent && (
                    <span className="mb-2 self-start px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">Plan actuel</span>
                  )}
                  <h4 className="font-semibold text-gray-900">{plan.name}</h4>
                  <div className="mt-1">
                    <span className="text-xl font-bold text-emerald-600">{price}</span>
                    {priceSuffix && <span className="text-sm text-gray-500 ml-0.5">{priceSuffix}</span>}
                  </div>
                  {billingPeriod === 'annual' && plan.annual > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">soit {formatCurrency(Math.round(plan.annual / 12))}/mois</p>
                  )}
                  {billingPeriod === 'monthly' && plan.annual > 0 && (
                    <p className="text-xs text-emerald-600 mt-0.5">Annuel: {formatCurrency(plan.annual)}</p>
                  )}
                  <ul className="mt-4 space-y-2 flex-1">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => { if (!isCurrent) { setPendingPlan(plan.key); setPlanChangeError('') } }}
                    disabled={isCurrent}
                    className={`w-full mt-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                      isCurrent
                        ? 'bg-emerald-100 text-emerald-700 cursor-default'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800'
                    }`}
                  >
                    {isCurrent ? 'Plan actuel' : 'Choisir ce plan'}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Historique paiements */}
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
                      <p className="text-xs text-gray-500">{p.reference} · {p.provider || p.method} · {p.period === 'annual' ? 'annuel' : 'mensuel'}</p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : p.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {p.status === 'completed' ? 'Payé' : p.status === 'pending' ? 'En attente' : 'Échoué'}
                      </span>
                      {p.paidAt && <p className="text-xs text-gray-400 mt-1">{new Date(p.paidAt).toLocaleDateString('fr-FR')}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal confirmation changement de plan */}
      {pendingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold">Changer de plan</h3>
              <button onClick={() => { setPendingPlan(null); setPlanChangeError('') }} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-1">Plan actuel</p>
                  <p className="font-semibold text-gray-900">{plans.find(p => p.key === subscription?.plan)?.name || subscription?.plan}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 text-right">
                  <p className="text-xs text-gray-500 mb-1">Nouveau plan</p>
                  <p className="font-semibold text-emerald-600">{plans.find(p => p.key === pendingPlan)?.name || pendingPlan}</p>
                </div>
              </div>
              {planAmounts[pendingPlan] > 0 && (
                <div className="p-3 bg-emerald-50 rounded-xl text-sm text-emerald-700">
                  <p>Tarif mensuel : <strong>{formatCurrency(planAmounts[pendingPlan])}/mois</strong></p>
                  {planAnnualAmounts[pendingPlan] > 0 && (
                    <p className="mt-0.5 text-xs">Tarif annuel : {formatCurrency(planAnnualAmounts[pendingPlan])}/an (2 mois offerts)</p>
                  )}
                </div>
              )}
              {planAmounts[pendingPlan] === 0 && pendingPlan !== 'ENTERPRISE' && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>Ce plan est gratuit et limité à 14 jours d&apos;essai.</p>
                </div>
              )}
              {pendingPlan === 'ENTERPRISE' && (
                <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>Un devis vous sera envoyé. Notre équipe vous contactera sous 24h.</p>
                </div>
              )}
              {planChangeError && (
                <div className="p-3 bg-red-50 rounded-xl text-sm text-red-700">{planChangeError}</div>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setPendingPlan(null); setPlanChangeError('') }}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                  Annuler
                </button>
                <button onClick={handleChangePlan} disabled={changingPlan}
                  className={`flex-1 py-2.5 text-sm font-medium text-white rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 transition-colors ${
                    pendingPlan && (planAmounts[pendingPlan] || 0) > 0 && pendingPlan !== 'ENTERPRISE'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}>
                  {changingPlan
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : pendingPlan && (planAmounts[pendingPlan] || 0) > 0 && pendingPlan !== 'ENTERPRISE'
                      ? <Smartphone className="w-4 h-4" />
                      : <CheckCircle className="w-4 h-4" />
                  }
                  {pendingPlan && (planAmounts[pendingPlan] || 0) > 0 && pendingPlan !== 'ENTERPRISE'
                    ? 'Confirmer et payer avec Wave'
                    : 'Confirmer'
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal paiement Wave */}
      {showPayment && subscription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold">Payer l&apos;abonnement</h3>
              <button onClick={() => setShowPayment(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-5">
              {/* Sélection période */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Période de facturation</label>
                <div className="flex gap-2">
                  {[
                    { key: 'monthly', label: 'Mensuel', suffix: '/mois' },
                    { key: 'annual', label: 'Annuel', badge: '-17%', suffix: '/an' },
                  ].map(p => {
                    const amt = p.key === 'annual'
                      ? (planAnnualAmounts[subscription.plan] || 0)
                      : (planAmounts[subscription.plan] || 0)
                    return (
                      <button key={p.key}
                        onClick={() => setBillingPeriod(p.key as 'monthly' | 'annual')}
                        className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${billingPeriod === p.key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-sm font-medium text-gray-900">{p.label}</span>
                          {p.badge && <span className="px-1.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">{p.badge}</span>}
                        </div>
                        <span className="text-lg font-bold text-gray-900">{formatCurrency(amt)}</span>
                        <span className="text-xs text-gray-500 ml-0.5">{p.suffix}</span>
                        {p.key === 'annual' && amt > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">soit {formatCurrency(Math.round(amt / 12))}/mois</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Récap montant */}
              <div className="p-4 bg-blue-50 rounded-xl text-center">
                <p className="text-sm text-gray-600">Total à payer</p>
                <p className="text-3xl font-bold text-blue-700 mt-1">{formatCurrency(currentAmount)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Plan {subscription.plan} — {billingPeriod === 'annual' ? '365 jours' : '30 jours'}
                </p>
              </div>

              {/* Méthodes de paiement */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Mode de paiement</label>
                <div className="space-y-2">
                  {paymentMethods.map(pm => (
                    <div key={pm.key}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                        pm.available
                          ? 'border-blue-500 bg-blue-50 cursor-default'
                          : 'border-gray-200 opacity-50 cursor-not-allowed'
                      }`}>
                      <div className={`w-10 h-10 rounded-lg ${pm.color} flex items-center justify-center text-white text-lg`}>
                        {pm.icon}
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-sm font-medium text-gray-900">{pm.label}</p>
                        <p className="text-xs text-gray-500">{pm.desc}</p>
                      </div>
                      {pm.available
                        ? <CheckCircle className="w-5 h-5 text-blue-500 flex-shrink-0" />
                        : <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-full flex-shrink-0">Bientôt</span>
                      }
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleInitiateWavePayment()}
                disabled={initiating || currentAmount === 0}
                className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {initiating
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Génération du QR code...</>
                  : <><Smartphone className="w-5 h-5" /> Payer {formatCurrency(currentAmount)} via Wave</>
                }
              </button>
              <p className="text-xs text-center text-gray-400">
                Un QR code Wave s&apos;ouvrira dans un nouvel onglet. Valable 10 minutes.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
