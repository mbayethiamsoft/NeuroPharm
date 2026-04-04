'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDashboard } from '@/components/DashboardProvider'
import { Loader2, Shield, Save, Plus, Trash2 } from 'lucide-react'

interface ConfigEntry {
  key: string
  value: string
}

const DEFAULT_CONFIGS: ConfigEntry[] = [
  { key: 'trial_duration_days', value: '14' },
  { key: 'max_users_trial', value: '3' },
  { key: 'max_users_basic', value: '10' },
  { key: 'max_users_professional', value: '50' },
  { key: 'max_users_enterprise', value: '999' },
  { key: 'payment_methods_enabled', value: 'mobile_money,card' },
  { key: 'support_email', value: 'support@neuropharm.sn' },
  { key: 'maintenance_mode', value: 'false' },
]

export default function SASettingsPage() {
  const { user } = useDashboard()
  const [configs, setConfigs] = useState<ConfigEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  if (user.role !== 'SUPER_ADMIN') {
    return <div className="flex items-center justify-center py-20"><Shield className="w-12 h-12 text-gray-300" /></div>
  }

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/superadmin/settings')
      const data = await res.json()
      const entries = Object.entries(data.settings || {}).map(([key, value]) => ({ key, value: String(value) }))
      if (entries.length === 0) {
        setConfigs(DEFAULT_CONFIGS)
      } else {
        setConfigs(entries)
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { fetchSettings() }, [fetchSettings])

  const handleSave = async () => {
    setSaving(true)
    const settings: Record<string, string> = {}
    for (const c of configs) {
      settings[c.key] = c.value
    }
    await fetch('/api/superadmin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    })
    setSaving(false)
    alert('Paramètres enregistrés')
  }

  const updateConfig = (key: string, value: string) => {
    setConfigs(prev => prev.map(c => c.key === key ? { ...c, value } : c))
  }

  const addConfig = () => {
    if (!newKey) return
    setConfigs(prev => [...prev, { key: newKey, value: newValue }])
    setNewKey('')
    setNewValue('')
  }

  const removeConfig = (key: string) => {
    setConfigs(prev => prev.filter(c => c.key !== key))
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Paramètres SaaS</h2>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="divide-y divide-gray-50">
            {configs.map(c => (
              <div key={c.key} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{c.key}</p>
                </div>
                <input value={c.value} onChange={e => updateConfig(c.key, e.target.value)}
                  className="w-64 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                <button onClick={() => removeConfig(c.key)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Add new config */}
          <div className="flex items-center gap-4 px-5 py-4 border-t border-gray-100 bg-gray-50/50">
            <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Nouvelle clé"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="Valeur"
              className="w-64 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <button onClick={addConfig} disabled={!newKey}
              className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
