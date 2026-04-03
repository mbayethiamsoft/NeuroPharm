'use client'

import { useState, useEffect } from 'react'
import { Truck, Plus, Edit2, Trash2, X, Loader2, Phone, Mail } from 'lucide-react'

interface Supplier {
  id: string
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  address: string | null
}

export default function FournisseursPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', contact: '', phone: '', email: '', address: '' })

  const fetchSuppliers = async () => {
    setLoading(true)
    const res = await fetch('/api/suppliers')
    const data = await res.json()
    setSuppliers(data.suppliers || [])
    setLoading(false)
  }

  useEffect(() => { fetchSuppliers() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', contact: '', phone: '', email: '', address: '' })
    setShowModal(true)
  }

  const openEdit = (s: Supplier) => {
    setEditing(s)
    setForm({ name: s.name, contact: s.contact || '', phone: s.phone || '', email: s.email || '', address: s.address || '' })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const url = editing ? `/api/suppliers/${editing.id}` : '/api/suppliers'
    const method = editing ? 'PUT' : 'POST'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    setShowModal(false)
    fetchSuppliers()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce fournisseur ?')) return
    await fetch(`/api/suppliers/${id}`, { method: 'DELETE' })
    fetchSuppliers()
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Fournisseurs</h2>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full text-center py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" /></div>
        ) : suppliers.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Truck className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-gray-400">Aucun fournisseur</p>
          </div>
        ) : suppliers.map(s => (
          <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{s.name}</h3>
                  {s.contact && <p className="text-xs text-gray-500">{s.contact}</p>}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="space-y-1.5 text-sm text-gray-600">
              {s.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-gray-400" />{s.phone}</div>}
              {s.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-gray-400" />{s.email}</div>}
              {s.address && <p className="text-xs text-gray-400">{s.address}</p>}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold">{editing ? 'Modifier' : 'Ajouter un fournisseur'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {[
                { label: 'Nom *', key: 'name', required: true },
                { label: 'Contact', key: 'contact' },
                { label: 'Telephone', key: 'phone' },
                { label: 'Email', key: 'email', type: 'email' },
                { label: 'Adresse', key: 'address' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input type={f.type || 'text'} required={f.required}
                    value={form[f.key as keyof typeof form]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                </div>
              ))}
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">Annuler</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} {editing ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
