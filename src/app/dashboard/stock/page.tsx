'use client'

import { useState, useEffect, useCallback } from 'react'
import { Package, AlertTriangle, Clock, Search, Plus, ArrowUpDown, Loader2, X } from 'lucide-react'

interface StockItem {
  id: string
  name: string
  genericName: string | null
  quantity: number
  minStock: number
  expiryDate: string | null
  status: string
  category: { name: string } | null
  sellingPrice: number
}

interface StockMovement {
  id: string
  type: string
  quantity: number
  reason: string | null
  reference: string | null
  createdAt: string
  medication: { name: string }
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

export default function StockPage() {
  const [tab, setTab] = useState<'overview' | 'movements'>('overview')
  const [medications, setMedications] = useState<StockItem[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [stats, setStats] = useState({ totalProducts: 0, lowStock: 0, expiringSoon: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [adjustForm, setAdjustForm] = useState({ medicationId: '', type: 'IN', quantity: '', reason: '' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    const res = await fetch(`/api/stock?${params}`)
    const data = await res.json()
    setMedications(data.medications || [])
    setStats(data.stats || { totalProducts: 0, lowStock: 0, expiringSoon: 0 })
    setLoading(false)
  }, [search])

  const fetchMovements = async () => {
    const res = await fetch('/api/stock/movements')
    const data = await res.json()
    setMovements(data.movements || [])
  }

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (tab === 'movements') fetchMovements() }, [tab])

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...adjustForm, quantity: parseInt(adjustForm.quantity) }),
    })
    setSaving(false)
    setShowModal(false)
    fetchData()
    if (tab === 'movements') fetchMovements()
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ok: 'bg-emerald-100 text-emerald-700',
      low: 'bg-amber-100 text-amber-700',
      critical: 'bg-red-100 text-red-700',
      expired: 'bg-red-100 text-red-700',
      expiring: 'bg-orange-100 text-orange-700',
    }
    const labels: Record<string, string> = {
      ok: 'OK', low: 'Stock bas', critical: 'Rupture', expired: 'Expire', expiring: 'Expire bientot',
    }
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || styles.ok}`}>{labels[status] || status}</span>
  }

  const movementBadge = (type: string) => {
    const styles: Record<string, string> = {
      IN: 'bg-emerald-100 text-emerald-700',
      OUT: 'bg-red-100 text-red-700',
      ADJUSTMENT: 'bg-blue-100 text-blue-700',
      RETURN: 'bg-violet-100 text-violet-700',
      EXPIRED: 'bg-gray-100 text-gray-700',
    }
    const labels: Record<string, string> = {
      IN: 'Entree', OUT: 'Sortie', ADJUSTMENT: 'Ajustement', RETURN: 'Retour', EXPIRED: 'Perime',
    }
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[type] || ''}`}>{labels[type] || type}</span>
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50"><Package className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalProducts}</p>
              <p className="text-sm text-gray-500">Total produits</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{stats.lowStock}</p>
              <p className="text-sm text-gray-500">Stock bas</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-50"><Clock className="w-5 h-5 text-red-600" /></div>
            <div>
              <p className="text-2xl font-bold text-red-600">{stats.expiringSoon}</p>
              <p className="text-sm text-gray-500">Expirations proches</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {[
            { key: 'overview', label: 'Vue d\'ensemble' },
            { key: 'movements', label: 'Mouvements' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as 'overview' | 'movements')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors">
          <ArrowUpDown className="w-4 h-4" /> Ajustement
        </button>
      </div>

      {tab === 'overview' && (
        <>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Médicament</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Stock actuel</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Stock min</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Valeur stock</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Expiration</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={6} className="text-center py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" /></td></tr>
                  ) : medications.map(med => (
                    <tr key={med.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{med.name}</p>
                        {med.category && <p className="text-xs text-gray-500">{med.category.name}</p>}
                      </td>
                      <td className="px-4 py-3 text-center font-medium">{med.quantity}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{med.minStock}</td>
                      <td className="px-4 py-3 text-right hidden md:table-cell text-gray-600">{formatCurrency(med.quantity * med.sellingPrice)}</td>
                      <td className="px-4 py-3 text-center hidden lg:table-cell text-gray-500">
                        {med.expiryDate ? new Date(med.expiryDate).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">{statusBadge(med.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'movements' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Médicament</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Type</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Quantité</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Reference</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Raison</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {movements.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">Aucun mouvement</td></tr>
                ) : movements.map(mv => (
                  <tr key={mv.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-500">{new Date(mv.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{mv.medication.name}</td>
                    <td className="px-4 py-3 text-center">{movementBadge(mv.type)}</td>
                    <td className="px-4 py-3 text-center font-medium">{mv.quantity}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell font-mono text-xs">{mv.reference || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{mv.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Ajustement de stock</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdjust} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Médicament *</label>
                <select required value={adjustForm.medicationId} onChange={e => setAdjustForm(f => ({ ...f, medicationId: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                  <option value="">Selectionner</option>
                  {medications.map(m => <option key={m.id} value={m.id}>{m.name} (stock: {m.quantity})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select value={adjustForm.type} onChange={e => setAdjustForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                  <option value="IN">Entree</option>
                  <option value="OUT">Sortie</option>
                  <option value="ADJUSTMENT">Ajustement</option>
                  <option value="RETURN">Retour</option>
                  <option value="EXPIRED">Perime</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantité *</label>
                <input type="number" required min="1" value={adjustForm.quantity} onChange={e => setAdjustForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Raison</label>
                <input value={adjustForm.reason} onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">Annuler</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
