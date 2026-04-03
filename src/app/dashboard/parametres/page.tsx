'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2, Building2, Settings, CreditCard } from 'lucide-react'

export default function ParametresPage() {
  const [tab, setTab] = useState<'pharmacy' | 'settings' | 'subscription'>('pharmacy')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pharmacy, setPharmacy] = useState({ name: '', address: '', city: '', phone: '', email: '', taxId: '' })
  const [settings, setSettings] = useState({ taxRate: 0, lowStockThreshold: 10, expiryAlertDays: 30, receiptHeader: '', receiptFooter: '' })
  const [subscription, setSubscription] = useState<{ plan: string; status: string; endDate: string | null } | null>(null)

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

  const handleSave = async () => {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pharmacy, settings }),
    })
    setSaving(false)
  }

  const plans = [
    { name: 'Essai', key: 'TRIAL', price: 'Gratuit', duration: '14 jours', features: ['1 utilisateur', 'Fonctions de base', 'Support email'] },
    { name: 'Basique', key: 'BASIC', price: '15 000 XOF/mois', duration: '', features: ['5 utilisateurs', 'Toutes les fonctions', 'Support prioritaire', 'Rapports'] },
    { name: 'Professionnel', key: 'PROFESSIONAL', price: '35 000 XOF/mois', duration: '', features: ['15 utilisateurs', 'Detection anomalies', 'API acces', 'Support 24/7', 'Multi-sites'] },
    { name: 'Entreprise', key: 'ENTERPRISE', price: 'Sur devis', duration: '', features: ['Utilisateurs illimites', 'IA predictive', 'Integrations custom', 'SLA garanti', 'Formation'] },
  ]

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { key: 'pharmacy', label: 'Pharmacie', icon: Building2 },
          { key: 'settings', label: 'Parametres', icon: Settings },
          { key: 'subscription', label: 'Abonnement', icon: CreditCard },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
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
              { label: 'Telephone', key: 'phone' },
              { label: 'Email', key: 'email', type: 'email' },
              { label: 'Numero fiscal', key: 'taxId' },
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
          <h3 className="font-semibold text-gray-900 mb-4">Parametres generaux</h3>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">En-tete du recu</label>
              <textarea value={settings.receiptHeader} onChange={e => setSettings(s => ({ ...s, receiptHeader: e.target.value }))}
                rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pied de page du recu</label>
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
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-md">
              <h3 className="font-semibold text-gray-900 mb-3">Abonnement actuel</h3>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-500">Plan</span><span className="font-medium">{subscription.plan}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Statut</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${subscription.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {subscription.status}
                  </span>
                </div>
                {subscription.endDate && (
                  <div className="flex justify-between"><span className="text-gray-500">Expire le</span><span>{new Date(subscription.endDate).toLocaleDateString('fr-FR')}</span></div>
                )}
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
    </div>
  )
}
