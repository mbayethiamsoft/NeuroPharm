'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDashboard } from '@/components/DashboardProvider'
import { useI18n } from '@/components/I18nProvider'
import { Loader2, Shield, Save, UserCog, UserCheck } from 'lucide-react'
import { ALL_MENU_KEYS, MENU_LABELS } from '@/lib/rbac'

interface UserWithPerms {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  isActive: boolean
  permissions: Record<string, boolean>
}

const roleBadge: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-700',
  PHARMACIST: 'bg-emerald-100 text-emerald-700',
  CASHIER: 'bg-blue-100 text-blue-700',
  ACCOUNTANT: 'bg-cyan-100 text-cyan-700',
}

export default function PermissionsPage() {
  const { user } = useDashboard()
  const { locale } = useI18n()
  const [users, setUsers] = useState<UserWithPerms[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [modified, setModified] = useState<Record<string, Record<string, boolean>>>({})
  const [reactivating, setReactivating] = useState<string | null>(null)

  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-900">Accès restreint</h3>
          <p className="text-gray-500">Seul l&apos;administrateur peut gérer les permissions</p>
        </div>
      </div>
    )
  }

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/permissions')
      const data = await res.json()
      setUsers(data.users || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { fetchUsers() }, [fetchUsers])

  const togglePermission = (userId: string, menuKey: string, currentValue: boolean) => {
    setModified(prev => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {}),
        [menuKey]: !currentValue,
      },
    }))
  }

  const getEffectiveValue = (userId: string, menuKey: string, originalValue: boolean): boolean => {
    if (modified[userId]?.[menuKey] !== undefined) {
      return modified[userId][menuKey]
    }
    return originalValue
  }

  const savePermissions = async (userId: string) => {
    const perms = modified[userId]
    if (!perms || Object.keys(perms).length === 0) return

    setSaving(userId)
    try {
      // Merge modified values with current for full picture
      const userObj = users.find(u => u.id === userId)
      if (!userObj) return

      const fullPerms: Record<string, boolean> = {}
      for (const key of ALL_MENU_KEYS) {
        fullPerms[key] = getEffectiveValue(userId, key, userObj.permissions[key])
      }

      await fetch('/api/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, permissions: fullPerms }),
      })

      // Update local state
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, permissions: fullPerms } : u))
      setModified(prev => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
    } catch { /* ignore */ }
    setSaving(null)
  }

  const handleReactivate = async (userId: string) => {
    setReactivating(userId)
    try {
      await fetch(`/api/personnel/${userId}/toggle`, { method: 'POST' })
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: true } : u))
    } catch { /* ignore */ }
    setReactivating(null)
  }

  const langKey = locale === 'en' ? 'en' : 'fr'

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <UserCog className="w-6 h-6 text-emerald-600" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {locale === 'en' ? 'Permissions Management' : 'Gestion des permissions'}
          </h2>
          <p className="text-sm text-gray-500">
            {locale === 'en'
              ? 'Configure menu access for each user. Admin always has full access.'
              : 'Configurez les accès menu pour chaque utilisateur. L\'admin a toujours un accès complet.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : users.filter(u => u.role !== 'ADMIN').length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-400">
            {locale === 'en' ? 'No non-admin users to configure' : 'Aucun utilisateur non-admin à configurer'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {users.filter(u => u.role !== 'ADMIN').map(u => {
            const hasChanges = modified[u.id] && Object.keys(modified[u.id]).length > 0
            return (
              <div key={u.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* User header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-sm font-semibold text-emerald-700">
                      {u.firstName[0]}{u.lastName[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{u.firstName} {u.lastName}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                    <span className={`ml-2 px-2 py-0.5 text-xs font-medium rounded-full ${roleBadge[u.role] || 'bg-gray-100 text-gray-700'}`}>
                      {u.role}
                    </span>
                    {!u.isActive && (
                      <>
                        <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">Inactif</span>
                        <button
                          onClick={() => handleReactivate(u.id)}
                          disabled={reactivating === u.id}
                          title="Réactiver cet employé"
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full hover:bg-emerald-100 disabled:opacity-60 transition-colors"
                        >
                          {reactivating === u.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <UserCheck className="w-3 h-3" />
                          }
                          {locale === 'en' ? 'Reactivate' : 'Réactiver'}
                        </button>
                      </>
                    )}
                  </div>
                  {hasChanges && (
                    <button
                      onClick={() => savePermissions(u.id)}
                      disabled={saving === u.id}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                    >
                      {saving === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {locale === 'en' ? 'Save' : 'Enregistrer'}
                    </button>
                  )}
                </div>

                {/* Permissions grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-0">
                  {ALL_MENU_KEYS.map(menuKey => {
                    const enabled = getEffectiveValue(u.id, menuKey, u.permissions[menuKey])
                    const isModified = modified[u.id]?.[menuKey] !== undefined
                    return (
                      <label
                        key={menuKey}
                        className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-r border-gray-50 ${
                          isModified ? 'bg-amber-50/50' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => togglePermission(u.id, menuKey, enabled)}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className={`text-sm ${enabled ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                          {MENU_LABELS[menuKey as keyof typeof MENU_LABELS]?.[langKey] || menuKey}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
