'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDashboard } from '@/components/DashboardProvider'
import { Users, Search, Loader2, Shield, ToggleLeft, ToggleRight, Key, X } from 'lucide-react'

interface UserData {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  role: string
  isActive: boolean
  lastLogin: string | null
  createdAt: string
  pharmacyId: string | null
  pharmacy: { id: string; name: string } | null
}

const roleBadge: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-700',
  ADMIN: 'bg-purple-100 text-purple-700',
  PHARMACIST: 'bg-emerald-100 text-emerald-700',
  CASHIER: 'bg-blue-100 text-blue-700',
  ACCOUNTANT: 'bg-cyan-100 text-cyan-700',
}

export default function SAUsersPage() {
  const { user } = useDashboard()
  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [resetModal, setResetModal] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)

  if (user.role !== 'SUPER_ADMIN') {
    return <div className="flex items-center justify-center py-20"><Shield className="w-12 h-12 text-gray-300" /></div>
  }

  const fetchUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filterRole) params.set('role', filterRole)
      const res = await fetch(`/api/superadmin/users?${params}`)
      const data = await res.json()
      setUsers(data.users || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [search, filterRole])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const timer = setTimeout(fetchUsers, 300)
    return () => clearTimeout(timer)
  }, [fetchUsers])

  const toggleActive = async (userId: string) => {
    await fetch('/api/superadmin/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'toggle_active' }),
    })
    fetchUsers()
  }

  const handleResetPassword = async () => {
    if (!resetModal || !newPassword) return
    setSaving(true)
    await fetch('/api/superadmin/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: resetModal, action: 'reset_password', newPassword }),
    })
    setSaving(false)
    setResetModal(null)
    setNewPassword('')
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Gestion des utilisateurs</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
              className="pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-48" />
          </div>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            <option value="">Tous les rôles</option>
            <option value="ADMIN">Admin</option>
            <option value="PHARMACIST">Pharmacien</option>
            <option value="CASHIER">Caissier</option>
            <option value="ACCOUNTANT">Comptable</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Utilisateur</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Pharmacie</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Rôle</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Dernière connexion</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Statut</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" /></td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Aucun utilisateur</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-sm font-semibold text-emerald-700">
                      {u.firstName[0]}{u.lastName[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{u.firstName} {u.lastName}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{u.pharmacy?.name || '-'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${roleBadge[u.role] || 'bg-gray-100 text-gray-700'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-xs text-gray-500 hidden lg:table-cell">
                  {u.lastLogin ? new Date(u.lastLogin).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Jamais'}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {u.isActive ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => toggleActive(u.id)} title={u.isActive ? 'Désactiver' : 'Activer'}
                      className={`p-1.5 rounded-lg transition-colors ${u.isActive ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                      {u.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button onClick={() => { setResetModal(u.id); setNewPassword('') }} title="Réinitialiser mot de passe"
                      className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors">
                      <Key className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Password reset modal */}
      {resetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold">Réinitialiser le mot de passe</h3>
              <button onClick={() => setResetModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe *</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={6} required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setResetModal(null)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">Annuler</button>
                <button onClick={handleResetPassword} disabled={saving || newPassword.length < 6}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-xl hover:bg-amber-700 disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Réinitialiser
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
