'use client'

import { useState, useEffect } from 'react'
import { Bell, Check, CheckCheck, Package, AlertTriangle, CreditCard, Shield, Settings, Loader2 } from 'lucide-react'

interface Notification {
  id: string
  title: string
  message: string
  type: string
  severity: string
  isRead: boolean
  link: string | null
  createdAt: string
}

const typeIcons: Record<string, typeof Bell> = {
  stock_low: Package,
  expiry: AlertTriangle,
  fraud: Shield,
  payment: CreditCard,
  system: Settings,
}

const severityColors: Record<string, string> = {
  info: 'border-l-blue-400 bg-blue-50/30',
  warning: 'border-l-amber-400 bg-amber-50/30',
  critical: 'border-l-red-400 bg-red-50/30',
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = async () => {
    setLoading(true)
    const res = await fetch('/api/notifications')
    const data = await res.json()
    setNotifications(data.notifications || [])
    setUnreadCount(data.unreadCount || 0)
    setLoading(false)
  }

  useEffect(() => { fetchNotifications() }, [])

  const markAsRead = async (ids: string[]) => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    fetchNotifications()
  }

  const markAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true }),
    })
    fetchNotifications()
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
          {unreadCount > 0 && (
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-full">{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors">
            <CheckCheck className="w-4 h-4" /> Tout marquer comme lu
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" /></div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-900">Aucune notification</h3>
          <p className="text-gray-500 mt-1">Vous serez notifie des evenements importants</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const Icon = typeIcons[n.type] || Bell
            return (
              <div key={n.id}
                className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 border-l-4 transition-colors ${
                  n.isRead ? 'opacity-60' : severityColors[n.severity] || ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${n.severity === 'critical' ? 'bg-red-100' : n.severity === 'warning' ? 'bg-amber-100' : 'bg-blue-100'}`}>
                    <Icon className={`w-4 h-4 ${n.severity === 'critical' ? 'text-red-600' : n.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900 text-sm">{n.title}</h4>
                      {!n.isRead && <span className="w-2 h-2 bg-emerald-500 rounded-full" />}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('fr-FR')}</p>
                  </div>
                  {!n.isRead && (
                    <button onClick={() => markAsRead([n.id])} className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50">
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
