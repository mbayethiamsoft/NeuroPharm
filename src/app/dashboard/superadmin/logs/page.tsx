'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDashboard } from '@/components/DashboardProvider'
import { Loader2, Shield, Activity, Clock } from 'lucide-react'

interface LogEntry {
  id: string
  level: string
  action: string
  userId: string | null
  userEmail: string | null
  targetId: string | null
  targetType: string | null
  details: string | null
  ipAddress: string | null
  createdAt: string
}

const levelColors: Record<string, string> = {
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  critical: 'bg-red-200 text-red-800',
}

export default function SALogsPage() {
  const { user } = useDashboard()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterLevel, setFilterLevel] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [page, setPage] = useState(0)
  const limit = 50

  if (user.role !== 'SUPER_ADMIN') {
    return <div className="flex items-center justify-center py-20"><Shield className="w-12 h-12 text-gray-300" /></div>
  }

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) })
      if (filterLevel) params.set('level', filterLevel)
      if (filterAction) params.set('action', filterAction)
      const res = await fetch(`/api/superadmin/logs?${params}`)
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [filterLevel, filterAction, page])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { fetchLogs() }, [fetchLogs])

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Logs système</h2>
          <p className="text-sm text-gray-500">{total} entrées</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filterLevel} onChange={e => { setFilterLevel(e.target.value); setPage(0) }}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            <option value="">Tous niveaux</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="critical">Critical</option>
          </select>
          <input value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(0) }}
            placeholder="Filtrer par action..." className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-48" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Activity className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>Aucun log</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {logs.map(log => (
              <div key={log.id} className="px-5 py-4 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 px-2 py-0.5 text-xs font-semibold rounded ${levelColors[log.level] || levelColors.info}`}>
                    {log.level}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{log.action}</p>
                      {log.targetType && (
                        <span className="text-xs text-gray-400">[{log.targetType}]</span>
                      )}
                    </div>
                    {log.details && <p className="text-sm text-gray-600 mt-0.5">{log.details}</p>}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(log.createdAt).toLocaleString('fr-FR', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })}
                      </span>
                      {log.userEmail && <span>• {log.userEmail}</span>}
                      {log.ipAddress && <span>• IP: {log.ipAddress}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
            Précédent
          </button>
          <span className="text-sm text-gray-500">
            Page {page + 1} / {Math.ceil(total / limit)}
          </span>
          <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * limit >= total}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
            Suivant
          </button>
        </div>
      )}
    </div>
  )
}
