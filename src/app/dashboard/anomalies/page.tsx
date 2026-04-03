'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Shield, Eye, RefreshCw, Loader2 } from 'lucide-react'

interface Anomaly {
  type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  details: Record<string, unknown>
}

interface AuditLog {
  id: string
  action: string
  entity: string
  entityId: string | null
  details: string | null
  isSuspicious: boolean
  createdAt: string
  user: { firstName: string; lastName: string } | null
}

const severityStyles = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  critical: 'bg-red-50 border-red-200 text-red-800',
}

export default function AnomaliesPage() {
  const [tab, setTab] = useState<'alerts' | 'audit'>('alerts')
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [stats, setStats] = useState({ totalAlerts: 0, critical: 0, suspicious: 0 })
  const [loading, setLoading] = useState(true)

  const fetchAnomalies = async () => {
    setLoading(true)
    const res = await fetch('/api/anomalies')
    const data = await res.json()
    setAnomalies(data.anomalies || [])
    setStats(data.stats || { totalAlerts: 0, critical: 0, suspicious: 0 })
    setLoading(false)
  }

  const fetchAudit = async () => {
    const res = await fetch('/api/audit')
    const data = await res.json()
    setAuditLogs(data.logs || [])
  }

  useEffect(() => { fetchAnomalies() }, [])
  useEffect(() => { if (tab === 'audit') fetchAudit() }, [tab])

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalAlerts}</p>
              <p className="text-sm text-gray-500">Alertes aujourd&apos;hui</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-50"><Shield className="w-5 h-5 text-red-600" /></div>
            <div>
              <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
              <p className="text-sm text-gray-500">Alertes critiques</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-50"><Eye className="w-5 h-5 text-violet-600" /></div>
            <div>
              <p className="text-2xl font-bold text-violet-600">{stats.suspicious}</p>
              <p className="text-sm text-gray-500">Logs suspects</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button onClick={() => setTab('alerts')} className={`px-4 py-2 text-sm font-medium rounded-lg ${tab === 'alerts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Alertes</button>
          <button onClick={() => setTab('audit')} className={`px-4 py-2 text-sm font-medium rounded-lg ${tab === 'audit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Journal d&apos;audit</button>
        </div>
        <button onClick={fetchAnomalies} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {tab === 'alerts' && (
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" /></div>
          ) : anomalies.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <Shield className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
              <h3 className="text-lg font-semibold text-gray-900">Aucune anomalie detectee</h3>
              <p className="text-gray-500 mt-1">Tout semble normal dans votre pharmacie</p>
            </div>
          ) : anomalies.map((a, i) => (
            <div key={i} className={`rounded-xl border p-4 ${severityStyles[a.severity]}`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase">{a.severity}</span>
                    <span className="text-xs opacity-75">• {a.type}</span>
                  </div>
                  <p className="font-medium">{a.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'audit' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Date/Heure</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Utilisateur</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Action</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Entite</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Details</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Suspect</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {auditLogs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">Aucun log</td></tr>
              ) : auditLogs.map(log => (
                <tr key={log.id} className={`hover:bg-gray-50/50 ${log.isSuspicious ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(log.createdAt).toLocaleString('fr-FR')}</td>
                  <td className="px-4 py-3 text-gray-900">{log.user ? `${log.user.firstName} ${log.user.lastName}` : '-'}</td>
                  <td className="px-4 py-3 text-center"><span className="px-2 py-1 text-xs bg-gray-100 rounded-full font-medium">{log.action}</span></td>
                  <td className="px-4 py-3 text-gray-600">{log.entity}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell max-w-xs truncate">{log.details || '-'}</td>
                  <td className="px-4 py-3 text-center">{log.isSuspicious && <span className="text-red-500 font-bold">⚠</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
