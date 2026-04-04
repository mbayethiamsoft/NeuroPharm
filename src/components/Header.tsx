'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bell, Search, Menu, ChevronDown, LogOut, Settings, User, X, Check, Globe } from 'lucide-react'
import { useDashboard } from './DashboardProvider'
import { useI18n } from './I18nProvider'
import { locales, localeNames, type Locale } from '@/lib/i18n'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Tableau de bord',
  '/dashboard/medicaments': 'Médicaments',
  '/dashboard/stock': 'Gestion du Stock',
  '/dashboard/ventes': 'Point de Vente',
  '/dashboard/fournisseurs': 'Fournisseurs',
  '/dashboard/personnel': 'Personnel',
  '/dashboard/comptabilite': 'Comptabilité',
  '/dashboard/anomalies': 'Anomalies',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/parametres': 'Paramètres',
  '/dashboard/profil': 'Mon Profil',
  '/dashboard/paie': 'Gestion de la Paie',
  '/dashboard/permissions': 'Permissions',
  '/dashboard/superadmin': 'Tableau de bord SaaS',
  '/dashboard/superadmin/pharmacies': 'Gestion des pharmacies',
  '/dashboard/superadmin/utilisateurs': 'Gestion des utilisateurs',
  '/dashboard/superadmin/abonnements': 'Abonnements & Paiements',
  '/dashboard/superadmin/logs': 'Logs système',
  '/dashboard/superadmin/support': 'Support',
  '/dashboard/superadmin/parametres': 'Paramètres SaaS',
}

interface NotificationItem {
  id: string
  title: string
  message: string
  type: string
  severity: string
  isRead: boolean
  createdAt: string
}

const searchablePages = [
  { name: 'Tableau de bord', href: '/dashboard', keywords: ['dashboard', 'accueil'] },
  { name: 'Médicaments', href: '/dashboard/medicaments', keywords: ['medicament', 'produit', 'stock'] },
  { name: 'Gestion du Stock', href: '/dashboard/stock', keywords: ['stock', 'inventaire', 'quantité'] },
  { name: 'Point de Vente', href: '/dashboard/ventes', keywords: ['vente', 'pos', 'caisse', 'panier'] },
  { name: 'Fournisseurs', href: '/dashboard/fournisseurs', keywords: ['fournisseur', 'commande'] },
  { name: 'Personnel', href: '/dashboard/personnel', keywords: ['personnel', 'employé', 'présence'] },
  { name: 'Comptabilité', href: '/dashboard/comptabilite', keywords: ['comptabilité', 'dépense', 'revenu', 'finance'] },
  { name: 'Anomalies', href: '/dashboard/anomalies', keywords: ['anomalie', 'alerte', 'fraude'] },
  { name: 'Notifications', href: '/dashboard/notifications', keywords: ['notification', 'alerte'] },
  { name: 'Paramètres', href: '/dashboard/parametres', keywords: ['paramètre', 'configuration', 'réglage'] },
  { name: 'Mon Profil', href: '/dashboard/profil', keywords: ['profil', 'compte', 'utilisateur'] },
  { name: 'Gestion de la Paie', href: '/dashboard/paie', keywords: ['paie', 'salaire', 'bulletin'] },
]

export default function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, toggleSidebar } = useDashboard()
  const { locale, t, setLocale } = useI18n()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loggingOut, setLoggingOut] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const langRef = useRef<HTMLDivElement>(null)

  const pageTitlesI18n: Record<string, string> = {
    '/dashboard': t.nav.dashboard,
    '/dashboard/medicaments': t.nav.medications,
    '/dashboard/stock': t.nav.stock,
    '/dashboard/ventes': t.nav.sales,
    '/dashboard/fournisseurs': t.nav.suppliers,
    '/dashboard/personnel': t.nav.staff,
    '/dashboard/comptabilite': t.nav.accounting,
    '/dashboard/anomalies': t.nav.anomalies,
    '/dashboard/notifications': t.nav.notifications,
    '/dashboard/parametres': t.nav.settings,
    '/dashboard/profil': t.nav.profile,
    '/dashboard/paie': t.nav.payroll,
  }
  const pageTitle = pageTitlesI18n[pathname] || pageTitles[pathname] || t.nav.dashboard

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false)
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchFocused(false)
      }
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchFocused(true)
      }
      if (e.key === 'Escape') {
        setSearchFocused(false)
        setSearchQuery('')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Mark notifications as read when opening dropdown
  const handleNotifOpen = async () => {
    setNotifOpen(!notifOpen)
    if (!notifOpen && unreadCount > 0) {
      try {
        await fetch('/api/notifications', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markAll: true }),
        })
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
        setUnreadCount(0)
      } catch { /* silent */ }
    }
  }

  // Logout handler
  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
      router.refresh()
    } catch {
      setLoggingOut(false)
    }
  }

  // Search results
  const searchResults = searchQuery.length >= 1
    ? searchablePages.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.keywords.some(k => k.includes(searchQuery.toLowerCase()))
      )
    : []

  const severityColors: Record<string, string> = {
    info: 'bg-blue-100 text-blue-700',
    warning: 'bg-amber-100 text-amber-700',
    critical: 'bg-red-100 text-red-700',
  }

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
      <div className="flex items-center justify-between h-full px-4 lg:px-8">
        {/* Left: Mobile menu + Title */}
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSidebar}
            className="lg:hidden p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{pageTitle}</h1>
            <p className="text-xs text-slate-500 hidden sm:block">
              {new Date().toLocaleDateString('fr-FR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>

        {/* Center: Search */}
        <div className="hidden md:flex flex-1 max-w-md mx-8" ref={searchRef}>
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher médicaments, ventes..."
              className={`
                w-full pl-10 pr-4 py-2.5 rounded-xl text-sm
                bg-slate-100/80 border border-transparent
                text-slate-700 placeholder-slate-400
                focus:outline-none focus:bg-white focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100
                transition-all duration-200
                ${searchFocused ? 'bg-white border-emerald-300 ring-2 ring-emerald-100' : ''}
              `}
              onFocus={() => setSearchFocused(true)}
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-200/60 rounded">
              Ctrl+K
            </kbd>

            {/* Search results dropdown */}
            {searchFocused && searchQuery.length >= 1 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50">
                {searchResults.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-400">Aucun résultat</div>
                ) : (
                  searchResults.map(result => (
                    <Link
                      key={result.href}
                      href={result.href}
                      onClick={() => { setSearchQuery(''); setSearchFocused(false) }}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Search className="w-4 h-4 text-slate-400" />
                      {result.name}
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Notifications + User */}
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={handleNotifOpen}
              className="relative p-2.5 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex items-center justify-center min-w-[18px] px-1 h-[18px] text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-lg shadow-slate-200/50 border border-slate-200/60 z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                  <Link
                    href="/dashboard/notifications"
                    onClick={() => setNotifOpen(false)}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    Voir tout
                  </Link>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-400">
                      Aucune notification
                    </div>
                  ) : (
                    notifications.slice(0, 8).map(notif => (
                      <div
                        key={notif.id}
                        className={`px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${!notif.isRead ? 'bg-emerald-50/30' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`mt-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded ${severityColors[notif.severity] || severityColors.info}`}>
                            {notif.severity === 'critical' ? '!' : notif.severity === 'warning' ? '⚠' : 'i'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{notif.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notif.message}</p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {new Date(notif.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {!notif.isRead && (
                            <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Language switcher */}
          <div className="relative" ref={langRef}>
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1.5 p-2.5 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title={t.common.language}
            >
              <Globe className="w-4 h-4" />
              <span className="text-xs font-medium uppercase hidden sm:inline">{locale}</span>
            </button>
            {langOpen && (
              <div className="absolute right-0 mt-2 w-36 bg-white rounded-xl shadow-lg shadow-slate-200/50 border border-slate-200/60 py-1 z-50">
                {locales.map(l => (
                  <button
                    key={l}
                    onClick={() => { setLocale(l); setLangOpen(false) }}
                    className={`flex items-center gap-2 w-full px-4 py-2 text-sm transition-colors ${
                      locale === l ? 'text-emerald-700 bg-emerald-50 font-medium' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {locale === l && <Check className="w-3.5 h-3.5" />}
                    <span className={locale !== l ? 'ml-5.5' : ''}>{localeNames[l]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2.5 p-1.5 pr-3 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-xs font-semibold shadow-sm">
                {user.firstName[0]}
                {user.lastName[0]}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium text-slate-700 leading-tight">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {user.email}
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 hidden sm:block ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg shadow-slate-200/50 border border-slate-200/60 py-1.5 z-50">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-900">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                </div>
                <div className="py-1">
                  <Link
                    href="/dashboard/profil"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <User className="w-4 h-4" />
                    {t.nav.profile}
                  </Link>
                  <Link
                    href="/dashboard/parametres"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    {t.nav.settings}
                  </Link>
                </div>
                <div className="border-t border-slate-100 pt-1">
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <LogOut className="w-4 h-4" />
                    {loggingOut ? t.auth.loggingOut : t.auth.logout}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
