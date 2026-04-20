'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDashboard } from '@/components/DashboardProvider'
import {
  Building2, Plus, X, Loader2, Shield, Search, Eye,
  ToggleLeft, ToggleRight, ExternalLink,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

interface PharmacyData {
  id: string
  name: string
  city: string | null
  country: string
  phone: string | null
  email: string | null
  isActive: boolean
  createdAt: string
  subscription: { id: string; plan: string; status: string; endDate: string | null } | null
  _count: { users: number; sales: number }
}

export default function SAPharmaciesPage() {
  const { user } = useDashboard()
  const router = useRouter()
  const [pharmacies, setPharmacies] = useState<PharmacyData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    pharmacyName: '', adminEmail: '', adminPassword: '', adminFirstName: '', adminLastName: '', plan: 'TRIAL',
  })

  if (user.role !== 'SUPER_ADMIN') {
    return <div className="flex items-center justify-center py-20"><Shield className="w-12 h-12 text-gray-300" /></div>
  }

  const fetchPharmacies = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pharmacies')
      const data = await res.json()
      setPharmacies(data.pharmacies || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { fetchPharmacies() }, [fetchPharmacies])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/admin/pharmacies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setShowModal(false)
    fetchPharmacies()
  }

  const togglePharmacy = async (id: string, isActive: boolean) => {
    await fetch(`/api/admin/pharmacies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    fetchPharmacies()
  }

  const handleImpersonate = async (pharmacyId: string) => {
    if (!confirm('Basculer en mode administrateur de cette pharmacie ? Cette action sera tracée.')) return
    const res = await fetch('/api/superadmin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pharmacyId }),
    })
    if (res.ok) {
      router.push('/dashboard')
      router.refresh()
    }
  }

  const filtered = pharmacies.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.city || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Gestion des pharmacies</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
              className="pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-48" />
          </div>
          <button onClick={() => { setForm({ pharmacyName: '', adminEmail: '', adminPassword: '', adminFirstName: '', adminLastName: '', plan: 'TRIAL' }); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Nouvelle pharmacie
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-row gap-4">
        <div className="flex-1 bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-gray-900">{pharmacies.length}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
        <div className="flex-1 bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-emerald-600">{pharmacies.filter(p => p.isActive).length}</p>
          <p className="text-xs text-gray-500">Actives</p>
        </div>
        <div className="flex-1 bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-red-600">{pharmacies.filter(p => !p.isActive).length}</p>
          <p className="text-xs text-gray-500">Suspendues</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Pharmacie</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Plan</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Utilisateurs</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Ventes</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Statut</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Aucune pharmacie</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.city || '-'} • {new Date(p.createdAt).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center hidden md:table-cell">
                  <span className="px-2 py-1 text-xs font-medium bg-violet-100 text-violet-700 rounded-full">
                    {p.subscription?.plan || 'N/A'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center hidden lg:table-cell">{p._count.users}</td>
                <td className="px-4 py-3 text-center hidden lg:table-cell">{p._count.sales}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {p.isActive ? 'Actif' : 'Suspendu'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => handleImpersonate(p.id)} title="Impersonation"
                      className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => togglePharmacy(p.id, p.isActive)} title={p.isActive ? 'Suspendre' : 'Activer'}
                      className={`p-1.5 rounded-lg transition-colors ${p.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                      {p.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleImpersonate(p.id)} title="Accéder"
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold">Créer une pharmacie</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la pharmacie *</label>
                <input required value={form.pharmacyName} onChange={e => setForm(f => ({ ...f, pharmacyName: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom admin *</label>
                  <input required value={form.adminFirstName} onChange={e => setForm(f => ({ ...f, adminFirstName: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom admin *</label>
                  <input required value={form.adminLastName} onChange={e => setForm(f => ({ ...f, adminLastName: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email admin *</label>
                <input type="email" required value={form.adminEmail} onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe *</label>
                <input type="password" required minLength={6} value={form.adminPassword} onChange={e => setForm(f => ({ ...f, adminPassword: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                  <option value="TRIAL">Essai</option>
                  <option value="BASIC">Basique</option>
                  <option value="PROFESSIONAL">Professionnel</option>
                  <option value="ENTERPRISE">Entreprise</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">Annuler</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
