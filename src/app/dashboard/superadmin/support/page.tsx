'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDashboard } from '@/components/DashboardProvider'
import { Loader2, Shield, Ticket, X, Send, Clock } from 'lucide-react'

interface TicketData {
  id: string
  name: string
  email: string
  subject: string
  message: string
  status: string
  priority: string
  response: string | null
  respondedAt: string | null
  createdAt: string
}

const statusColors: Record<string, string> = {
  open: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-gray-100 text-gray-700',
}

const priorityColors: Record<string, string> = {
  low: 'text-gray-500',
  normal: 'text-blue-600',
  high: 'text-amber-600',
  urgent: 'text-red-600',
}

export default function SASupportPage() {
  const { user } = useDashboard()
  const [tickets, setTickets] = useState<TicketData[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null)
  const [responseText, setResponseText] = useState('')
  const [saving, setSaving] = useState(false)

  if (user.role !== 'SUPER_ADMIN') {
    return <div className="flex items-center justify-center py-20"><Shield className="w-12 h-12 text-gray-300" /></div>
  }

  const fetchTickets = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterStatus) params.set('status', filterStatus)
      const res = await fetch(`/api/support?${params}`)
      const data = await res.json()
      setTickets(data.tickets || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [filterStatus])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { fetchTickets() }, [fetchTickets])

  const handleRespond = async () => {
    if (!selectedTicket || !responseText) return
    setSaving(true)
    await fetch('/api/support', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketId: selectedTicket.id,
        response: responseText,
        status: 'resolved',
      }),
    })
    setSaving(false)
    setSelectedTicket(null)
    setResponseText('')
    fetchTickets()
  }

  const updateStatus = async (ticketId: string, status: string) => {
    await fetch('/api/support', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId, status }),
    })
    fetchTickets()
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Tickets de support</h2>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
          <option value="">Tous</option>
          <option value="open">Ouverts</option>
          <option value="in_progress">En cours</option>
          <option value="resolved">Résolus</option>
          <option value="closed">Fermés</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <Ticket className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p className="text-gray-400">Aucun ticket</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{t.subject}</h3>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusColors[t.status] || statusColors.open}`}>
                      {t.status}
                    </span>
                    <span className={`text-xs font-medium ${priorityColors[t.priority] || ''}`}>
                      {t.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">{t.message}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>{t.name} ({t.email})</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(t.createdAt).toLocaleString('fr-FR')}</span>
                  </div>
                  {t.response && (
                    <div className="mt-3 p-3 bg-emerald-50 rounded-xl">
                      <p className="text-xs text-emerald-700 font-medium mb-1">Réponse:</p>
                      <p className="text-sm text-emerald-800">{t.response}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {t.status === 'open' && (
                    <button onClick={() => updateStatus(t.id, 'in_progress')}
                      className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      En cours
                    </button>
                  )}
                  {!t.response && (
                    <button onClick={() => { setSelectedTicket(t); setResponseText('') }}
                      className="px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                      Répondre
                    </button>
                  )}
                  {t.status !== 'closed' && (
                    <button onClick={() => updateStatus(t.id, 'closed')}
                      className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                      Fermer
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Response modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold">Répondre au ticket</h3>
              <button onClick={() => setSelectedTicket(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm font-medium text-gray-900">{selectedTicket.subject}</p>
                <p className="text-xs text-gray-500 mt-1">{selectedTicket.name} ({selectedTicket.email})</p>
                <p className="text-sm text-gray-600 mt-2">{selectedTicket.message}</p>
              </div>
              <textarea value={responseText} onChange={e => setResponseText(e.target.value)} rows={4}
                placeholder="Votre réponse..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              <div className="flex justify-end gap-3">
                <button onClick={() => setSelectedTicket(null)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">Annuler</button>
                <button onClick={handleRespond} disabled={saving || !responseText}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Envoyer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
