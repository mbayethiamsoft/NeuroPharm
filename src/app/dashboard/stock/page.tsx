'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Package, AlertTriangle, Clock, Search, ArrowUpDown, Loader2, X, Warehouse, Store, ArrowRightLeft, Upload, FileText, CheckCircle2 } from 'lucide-react'

type QuickField = 'sellingPrice' | 'expiryDate'

interface StockItem {
  id: string
  name: string
  genericName: string | null
  quantity: number             // total (warehouse + shelf)
  shelfQuantity: number        // sellable (in shelves)
  warehouseQuantity: number    // server-computed: quantity - shelfQuantity
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
  location: string | null
  reason: string | null
  reference: string | null
  createdAt: string
  medication: { name: string }
}

type FilterLocation = 'all' | 'warehouse' | 'shelf'

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

export default function StockPage() {
  const [tab, setTab] = useState<'overview' | 'movements'>('overview')
  const [medications, setMedications] = useState<StockItem[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [stats, setStats] = useState({
    totalProducts: 0,
    lowStock: 0,
    expiringSoon: 0,
    totalWarehouse: 0,
    totalShelf: 0,
    awaitingTransfer: 0,
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLocation, setFilterLocation] = useState<FilterLocation>('all')

  const [showAdjust, setShowAdjust] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [adjustForm, setAdjustForm] = useState({
    medicationId: '', type: 'IN', quantity: '', reason: '', location: 'warehouse' as 'warehouse' | 'shelf',
  })
  const [transferForm, setTransferForm] = useState({ medicationId: '', quantity: '', reason: '' })

  const [editing, setEditing] = useState<{ id: string; field: QuickField; value: string } | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [quickError, setQuickError] = useState<string | null>(null)
  const editingRef = useRef<{ id: string; field: QuickField } | null>(null)

  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    created: number
    updated: number
    skipped: number
    errors: { line: number; message: string }[]
    errorMessage?: string
  } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    const res = await fetch(`/api/stock?${params}`)
    const data = await res.json()
    setMedications(data.medications || [])
    setStats(data.stats || { totalProducts: 0, lowStock: 0, expiringSoon: 0, totalWarehouse: 0, totalShelf: 0, awaitingTransfer: 0 })
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
    setFormError(null)
    const res = await fetch('/api/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...adjustForm, quantity: parseInt(adjustForm.quantity) }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setFormError(data.error || 'Erreur serveur')
      return
    }
    setShowAdjust(false)
    setAdjustForm({ medicationId: '', type: 'IN', quantity: '', reason: '', location: 'warehouse' })
    fetchData()
    if (tab === 'movements') fetchMovements()
  }

  const openTransfer = (medicationId = '') => {
    setTransferForm({ medicationId, quantity: '', reason: '' })
    setFormError(null)
    setShowTransfer(true)
  }

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    const res = await fetch('/api/stock/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...transferForm, quantity: parseInt(transferForm.quantity) }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setFormError(data.error || 'Erreur serveur')
      return
    }
    setShowTransfer(false)
    fetchData()
    if (tab === 'movements') fetchMovements()
  }

  const startQuickEdit = (med: StockItem, field: QuickField) => {
    let value = ''
    if (field === 'sellingPrice') value = String(med.sellingPrice)
    else if (field === 'expiryDate') value = med.expiryDate ? med.expiryDate.split('T')[0] : ''
    editingRef.current = { id: med.id, field }
    setQuickError(null)
    setEditing({ id: med.id, field, value })
  }

  const cancelQuickEdit = () => {
    editingRef.current = null
    setEditing(null)
    setQuickError(null)
  }

  const saveQuickEdit = async () => {
    const current = editingRef.current
    if (!current || !editing) return
    if (savingKey === `${current.id}-${current.field}`) return
    const med = medications.find(m => m.id === current.id)
    if (!med) { cancelQuickEdit(); return }

    const raw = editing.value
    const payload: Record<string, unknown> = {}
    let unchanged = false

    if (current.field === 'sellingPrice') {
      const n = parseFloat(raw)
      if (Number.isNaN(n) || n < 0) { setQuickError('Prix de vente invalide'); return }
      if (n === med.sellingPrice) unchanged = true
      payload.sellingPrice = n
    } else if (current.field === 'expiryDate') {
      const next = raw || null
      const currentIso = med.expiryDate ? med.expiryDate.split('T')[0] : null
      if (currentIso === next) unchanged = true
      payload.expiryDate = next
    }

    if (unchanged) { cancelQuickEdit(); return }

    const key = `${current.id}-${current.field}`
    setSavingKey(key)
    try {
      const res = await fetch(`/api/medications/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setQuickError(data.error || 'Erreur lors de la mise à jour')
        return
      }
      const updated = await res.json()
      setMedications(prev => prev.map(m => m.id === current.id ? {
        ...m,
        sellingPrice: updated.sellingPrice,
        expiryDate: updated.expiryDate,
      } : m))
      editingRef.current = null
      setEditing(null)
      setQuickError(null)
    } catch {
      setQuickError('Erreur réseau')
    } finally {
      setSavingKey(null)
    }
  }

  const handleQuickKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); saveQuickEdit() }
    else if (e.key === 'Escape') { e.preventDefault(); cancelQuickEdit() }
  }

  const openImport = () => {
    setImportFile(null)
    setImportResult(null)
    setShowImport(true)
  }

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!importFile) return
    setImporting(true)
    setImportResult(null)
    const fd = new FormData()
    fd.append('file', importFile)
    try {
      const res = await fetch('/api/medications/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setImportResult({ created: 0, updated: 0, skipped: 0, errors: [], errorMessage: data.error || "Erreur lors de l'import" })
      } else {
        setImportResult(data)
        fetchData()
        if (tab === 'movements') fetchMovements()
      }
    } catch {
      setImportResult({ created: 0, updated: 0, skipped: 0, errors: [], errorMessage: 'Erreur réseau' })
    } finally {
      setImporting(false)
    }
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
      TRANSFER: 'bg-indigo-100 text-indigo-700',
    }
    const labels: Record<string, string> = {
      IN: 'Entree', OUT: 'Sortie', ADJUSTMENT: 'Ajustement', RETURN: 'Retour', EXPIRED: 'Perime', TRANSFER: 'Transfert',
    }
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[type] || ''}`}>{labels[type] || type}</span>
  }

  const locationBadge = (loc: string | null) => {
    if (!loc) return <span className="text-xs text-gray-400">-</span>
    const styles: Record<string, string> = {
      warehouse: 'bg-slate-100 text-slate-700',
      shelf: 'bg-teal-100 text-teal-700',
    }
    const labels: Record<string, string> = { warehouse: 'Magasin', shelf: 'Rayon' }
    return <span className={`px-2 py-0.5 text-[11px] font-medium rounded ${styles[loc] || 'bg-gray-100 text-gray-600'}`}>{labels[loc] || loc}</span>
  }

  const visibleMeds = medications.filter(m => {
    if (filterLocation === 'warehouse') return m.warehouseQuantity > 0
    if (filterLocation === 'shelf') return m.shelfQuantity > 0
    return true
  })

  const selectedMed = medications.find(m => m.id === transferForm.medicationId)
  const transferableMeds = medications.filter(m => m.warehouseQuantity > 0)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-50"><Package className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-xl font-bold text-gray-900">{stats.totalProducts}</p>
              <p className="text-xs text-gray-500">Total produits</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-100"><Warehouse className="w-5 h-5 text-slate-700" /></div>
            <div>
              <p className="text-xl font-bold text-slate-700">{stats.totalWarehouse}</p>
              <p className="text-xs text-gray-500">En magasin</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-50"><Store className="w-5 h-5 text-teal-600" /></div>
            <div>
              <p className="text-xl font-bold text-teal-600">{stats.totalShelf}</p>
              <p className="text-xs text-gray-500">En rayons (vendable)</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-50"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-xl font-bold text-amber-600">{stats.lowStock}</p>
              <p className="text-xs text-gray-500">Stock bas</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-50"><Clock className="w-5 h-5 text-red-600" /></div>
            <div>
              <p className="text-xl font-bold text-red-600">{stats.expiringSoon}</p>
              <p className="text-xs text-gray-500">Expirations proches</p>
            </div>
          </div>
        </div>
      </div>

      {quickError && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {quickError}</div>
          <button onClick={() => setQuickError(null)} className="p-1 rounded-md hover:bg-red-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {stats.awaitingTransfer > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
          <div className="flex items-center gap-2 text-sm text-indigo-800">
            <ArrowRightLeft className="w-4 h-4" />
            <span><strong>{stats.awaitingTransfer}</strong> produit(s) uniquement en magasin — transferez-les vers les rayons pour les rendre vendables.</span>
          </div>
          <button onClick={() => openTransfer()} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
            Transferer
          </button>
        </div>
      )}

      {/* Tabs + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {[
            { key: 'overview', label: "Vue d'ensemble" },
            { key: 'movements', label: 'Mouvements' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as 'overview' | 'movements')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openImport} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
            <Upload className="w-4 h-4" /> Importer
          </button>
          <button onClick={() => openTransfer()} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
            <ArrowRightLeft className="w-4 h-4" /> Transferer
          </button>
          <button onClick={() => { setAdjustForm({ medicationId: '', type: 'IN', quantity: '', reason: '', location: 'warehouse' }); setFormError(null); setShowAdjust(true) }} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors">
            <ArrowUpDown className="w-4 h-4" /> Ajustement
          </button>
        </div>
      </div>

      {tab === 'overview' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative max-w-md flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {(['all', 'warehouse', 'shelf'] as const).map(opt => (
                <button key={opt} onClick={() => setFilterLocation(opt)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterLocation === opt ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {opt === 'all' ? 'Tous' : opt === 'warehouse' ? 'Magasin' : 'Rayons'}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Médicament</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Magasin</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Rayons</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Total</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Stock min</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Prix vente</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Expiration</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Statut</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={9} className="text-center py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" /></td></tr>
                  ) : visibleMeds.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-12 text-gray-400">Aucun médicament</td></tr>
                  ) : visibleMeds.map(med => (
                    <tr key={med.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{med.name}</p>
                        {med.category && <p className="text-xs text-gray-500">{med.category.name}</p>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 font-medium ${med.warehouseQuantity > 0 ? 'text-slate-700' : 'text-gray-300'}`}>
                          <Warehouse className="w-3.5 h-3.5" /> {med.warehouseQuantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 font-medium ${med.shelfQuantity > 0 ? 'text-teal-700' : 'text-gray-300'}`}>
                          <Store className="w-3.5 h-3.5" /> {med.shelfQuantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-900">{med.quantity}</td>
                      <td className="px-4 py-3 text-center text-gray-500 hidden md:table-cell">{med.minStock}</td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell text-gray-700 font-medium">
                        {editing?.id === med.id && editing.field === 'sellingPrice' ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              autoFocus
                              type="number"
                              min="0"
                              disabled={savingKey === `${med.id}-sellingPrice`}
                              value={editing.value}
                              onChange={e => setEditing({ ...editing, value: e.target.value })}
                              onBlur={() => saveQuickEdit()}
                              onKeyDown={handleQuickKeyDown}
                              className="w-24 px-2 py-1 text-sm text-right border border-emerald-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                            />
                            {savingKey === `${med.id}-sellingPrice` && <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startQuickEdit(med, 'sellingPrice')}
                            className="px-2 py-1 -my-1 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors"
                            title="Modifier le prix de vente"
                          >
                            {formatCurrency(med.sellingPrice)}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center hidden lg:table-cell text-gray-500">
                        {editing?.id === med.id && editing.field === 'expiryDate' ? (
                          <div className="flex items-center justify-center gap-1">
                            <input
                              autoFocus
                              type="date"
                              disabled={savingKey === `${med.id}-expiryDate`}
                              value={editing.value}
                              onChange={e => setEditing({ ...editing, value: e.target.value })}
                              onBlur={() => saveQuickEdit()}
                              onKeyDown={handleQuickKeyDown}
                              className="px-2 py-1 text-sm border border-emerald-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                            />
                            {savingKey === `${med.id}-expiryDate` && <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startQuickEdit(med, 'expiryDate')}
                            className="px-2 py-1 -my-1 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors"
                            title="Modifier la date d'expiration"
                          >
                            {med.expiryDate ? new Date(med.expiryDate).toLocaleDateString('fr-FR') : '—'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">{statusBadge(med.status)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openTransfer(med.id)}
                          disabled={med.warehouseQuantity <= 0}
                          className="px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                          title={med.warehouseQuantity > 0 ? 'Transferer vers rayon' : 'Rien à transferer'}
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" /> Transferer
                        </button>
                      </td>
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
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Localisation</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Quantité</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Reference</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Raison</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {movements.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">Aucun mouvement</td></tr>
                ) : movements.map(mv => (
                  <tr key={mv.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-500">{new Date(mv.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{mv.medication.name}</td>
                    <td className="px-4 py-3 text-center">{movementBadge(mv.type)}</td>
                    <td className="px-4 py-3 text-center">{locationBadge(mv.location)}</td>
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

      {/* Transfer modal */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-gray-900">Transfert magasin → rayons</h3>
              </div>
              <button onClick={() => setShowTransfer(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleTransfer} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Médicament *</label>
                <select required value={transferForm.medicationId} onChange={e => setTransferForm(f => ({ ...f, medicationId: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40">
                  <option value="">Selectionner</option>
                  {transferableMeds.map(m => (
                    <option key={m.id} value={m.id}>{m.name} — magasin: {m.warehouseQuantity}</option>
                  ))}
                </select>
                {transferableMeds.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500">Aucun médicament avec stock en magasin.</p>
                )}
              </div>
              {selectedMed && (
                <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-xl text-xs">
                  <div><span className="text-gray-500">Magasin :</span> <strong className="text-slate-700">{selectedMed.warehouseQuantity}</strong></div>
                  <div><span className="text-gray-500">Rayons :</span> <strong className="text-teal-700">{selectedMed.shelfQuantity}</strong></div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantité à transferer *</label>
                <input type="number" required min="1" max={selectedMed?.warehouseQuantity} value={transferForm.quantity} onChange={e => setTransferForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Raison (optionnel)</label>
                <input value={transferForm.reason} onChange={e => setTransferForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Ex: Réapprovisionnement rayon"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setShowTransfer(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">Annuler</button>
                <button type="submit" disabled={saving || !transferForm.medicationId} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Transferer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {showAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Ajustement de stock</h3>
              <button onClick={() => setShowAdjust(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdjust} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Médicament *</label>
                <select required value={adjustForm.medicationId} onChange={e => setAdjustForm(f => ({ ...f, medicationId: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                  <option value="">Selectionner</option>
                  {medications.map(m => <option key={m.id} value={m.id}>{m.name} (magasin: {m.warehouseQuantity}, rayon: {m.shelfQuantity})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select value={adjustForm.type} onChange={e => setAdjustForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                    <option value="IN">Entrée</option>
                    <option value="OUT">Sortie</option>
                    <option value="ADJUSTMENT">Ajustement</option>
                    <option value="RETURN">Retour</option>
                    <option value="EXPIRED">Périmé</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Localisation *</label>
                  <select value={adjustForm.location} onChange={e => setAdjustForm(f => ({ ...f, location: e.target.value as 'warehouse' | 'shelf' }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                    <option value="warehouse">Magasin</option>
                    <option value="shelf">Rayons</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantité * {adjustForm.type === 'ADJUSTMENT' && <span className="text-xs text-gray-500 font-normal">(peut être négative)</span>}
                </label>
                <input type="number" required value={adjustForm.quantity} onChange={e => setAdjustForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Raison</label>
                <input value={adjustForm.reason} onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setShowAdjust(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">Annuler</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" /> Importer une liste fournisseur
              </h3>
              <button onClick={() => setShowImport(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleImport} className="p-5 space-y-4">
              <div className="text-sm text-gray-600 space-y-1">
                <p>Fichier CSV attendu (séparateur <code className="px-1 py-0.5 bg-gray-100 rounded">;</code>) avec les colonnes :</p>
                <p className="text-xs text-gray-500 font-mono break-all">
                  Date ; Numero Facture ; Code Cip ; Description ; Laboratoire ; Quantitee livree ; Unite Gratuite ; Prix de Cession Hors Taxe ; Prix public ; Prix TTC
                </p>
                <p className="text-xs text-gray-500">Les médicaments existants (reconnus par leur Code CIP) voient leur stock magasin incrémenté, les autres sont créés. Un transfert vers les rayons reste nécessaire pour les rendre vendables.</p>
              </div>

              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-6 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors">
                <FileText className="w-8 h-8 text-gray-400" />
                {importFile ? (
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-900">{importFile.name}</p>
                    <p className="text-xs text-gray-500">{(importFile.size / 1024).toFixed(1)} Ko</p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700">Cliquez pour sélectionner un fichier</p>
                    <p className="text-xs text-gray-500">.csv uniquement</p>
                  </>
                )}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportResult(null) }}
                  className="hidden"
                />
              </label>

              {importResult && (
                <div className="space-y-2">
                  {importResult.errorMessage ? (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{importResult.errorMessage}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-800">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong>{importResult.created}</strong> créé(s), <strong>{importResult.updated}</strong> mis à jour, <strong>{importResult.skipped}</strong> ignoré(s)
                        </span>
                      </div>
                      {importResult.errors.length > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-800 max-h-40 overflow-y-auto">
                          <div className="flex items-center gap-1.5 font-medium mb-1">
                            <AlertTriangle className="w-4 h-4" /> {importResult.errors.length} ligne(s) en erreur
                          </div>
                          <ul className="space-y-0.5 text-xs">
                            {importResult.errors.slice(0, 20).map((err, i) => (
                              <li key={i}>Ligne {err.line} : {err.message}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setShowImport(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                  {importResult && !importResult.errorMessage ? 'Fermer' : 'Annuler'}
                </button>
                <button type="submit" disabled={!importFile || importing} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                  {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {importing ? 'Import en cours...' : 'Importer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
