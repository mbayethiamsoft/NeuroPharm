'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pill, Plus, Search, Edit2, Trash2, X, Loader2 } from 'lucide-react'

interface Medication {
  id: string
  name: string
  genericName: string | null
  barcode: string | null
  dosage: string | null
  form: string | null
  category: { id: string; name: string } | null
  purchasePrice: number
  sellingPrice: number
  quantity: number
  minStock: number
  expiryDate: string | null
  location: string | null
  requiresPrescription: boolean
}

interface Category {
  id: string
  name: string
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

export default function MedicamentsPage() {
  const [medications, setMedications] = useState<Medication[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingMed, setEditingMed] = useState<Medication | null>(null)
  const [saving, setSaving] = useState(false)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })

  const [form, setForm] = useState({
    name: '', genericName: '', barcode: '', dosage: '', form: '',
    categoryId: '', purchasePrice: '', sellingPrice: '', quantity: '',
    minStock: '10', expiryDate: '', location: '', requiresPrescription: false,
  })

  const fetchMedications = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(pagination.page), limit: '20' })
    if (search) params.set('search', search)
    if (categoryFilter) params.set('category', categoryFilter)
    const res = await fetch(`/api/medications?${params}`)
    const data = await res.json()
    setMedications(data.medications || [])
    setPagination(p => ({ ...p, totalPages: data.pagination?.totalPages || 1, total: data.pagination?.total || 0 }))
    setLoading(false)
  }, [search, categoryFilter, pagination.page])

  useEffect(() => {
    fetchMedications()
  }, [fetchMedications])

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(d => setCategories(d.categories || []))
  }, [])

  const openCreate = () => {
    setEditingMed(null)
    setForm({ name: '', genericName: '', barcode: '', dosage: '', form: '', categoryId: '', purchasePrice: '', sellingPrice: '', quantity: '', minStock: '10', expiryDate: '', location: '', requiresPrescription: false })
    setShowModal(true)
  }

  const openEdit = (med: Medication) => {
    setEditingMed(med)
    setForm({
      name: med.name, genericName: med.genericName || '', barcode: med.barcode || '',
      dosage: med.dosage || '', form: med.form || '', categoryId: med.category?.id || '',
      purchasePrice: String(med.purchasePrice), sellingPrice: String(med.sellingPrice),
      quantity: String(med.quantity), minStock: String(med.minStock),
      expiryDate: med.expiryDate ? med.expiryDate.split('T')[0] : '',
      location: med.location || '', requiresPrescription: med.requiresPrescription,
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const url = editingMed ? `/api/medications/${editingMed.id}` : '/api/medications'
    const method = editingMed ? 'PUT' : 'POST'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    setShowModal(false)
    fetchMedications()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce medicament ?')) return
    await fetch(`/api/medications/${id}`, { method: 'DELETE' })
    fetchMedications()
  }

  const getStockBadge = (med: Medication) => {
    if (med.quantity <= 0) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Rupture</span>
    if (med.quantity <= med.minStock) return <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Stock bas</span>
    return <span className="px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">OK</span>
  }

  const getExpiryColor = (date: string | null) => {
    if (!date) return 'text-gray-400'
    const d = new Date(date)
    const now = new Date()
    if (d < now) return 'text-red-600 font-medium'
    if (d < new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) return 'text-amber-600'
    return 'text-gray-600'
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher medicament ou code-barres..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })) }}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })) }}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="">Toutes categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Medicament</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Categorie</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Prix achat</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Prix vente</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Stock</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Expiration</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Statut</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" /></td></tr>
              ) : medications.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12">
                  <Pill className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-gray-400">Aucun medicament trouve</p>
                </td></tr>
              ) : medications.map(med => (
                <tr key={med.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{med.name}</div>
                    {med.genericName && <div className="text-xs text-gray-500">{med.genericName}</div>}
                    {med.barcode && <div className="text-xs text-gray-400 font-mono">{med.barcode}</div>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {med.category ? (
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">{med.category.name}</span>
                    ) : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(med.purchasePrice)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(med.sellingPrice)}</td>
                  <td className="px-4 py-3 text-center font-medium">{med.quantity}</td>
                  <td className={`px-4 py-3 text-center hidden lg:table-cell ${getExpiryColor(med.expiryDate)}`}>
                    {med.expiryDate ? new Date(med.expiryDate).toLocaleDateString('fr-FR') : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">{getStockBadge(med)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(med)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(med.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">{pagination.total} medicament(s)</span>
            <div className="flex gap-1">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPagination(prev => ({ ...prev, page: p }))}
                  className={`px-3 py-1 text-sm rounded-lg ${p === pagination.page ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingMed ? 'Modifier le medicament' : 'Ajouter un medicament'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom generique</label>
                  <input value={form.genericName} onChange={e => setForm(f => ({ ...f, genericName: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code-barres</label>
                  <input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dosage</label>
                  <input value={form.dosage} onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))}
                    placeholder="ex: 500mg" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Forme</label>
                  <select value={form.form} onChange={e => setForm(f => ({ ...f, form: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500">
                    <option value="">Selectionner</option>
                    <option value="comprime">Comprime</option>
                    <option value="gelule">Gelule</option>
                    <option value="sirop">Sirop</option>
                    <option value="injection">Injection</option>
                    <option value="creme">Creme</option>
                    <option value="suppositoire">Suppositoire</option>
                    <option value="gouttes">Gouttes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categorie</label>
                  <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500">
                    <option value="">Aucune</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prix d&apos;achat *</label>
                  <input type="number" required value={form.purchasePrice} onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prix de vente *</label>
                  <input type="number" required value={form.sellingPrice} onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantite</label>
                  <input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock minimum</label>
                  <input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date d&apos;expiration</label>
                  <input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emplacement</label>
                  <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="ex: Etagere A3" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.requiresPrescription}
                  onChange={e => setForm(f => ({ ...f, requiresPrescription: e.target.checked }))}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                Necessite une ordonnance
              </label>
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                  Annuler
                </button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingMed ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
