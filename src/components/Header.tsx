'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, Search, Menu, ChevronDown, LogOut, Settings, User } from 'lucide-react'
import { useDashboard } from './DashboardProvider'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Tableau de bord',
  '/dashboard/medicaments': 'Medicaments',
  '/dashboard/stock': 'Gestion du Stock',
  '/dashboard/ventes': 'Point de Vente',
  '/dashboard/fournisseurs': 'Fournisseurs',
  '/dashboard/personnel': 'Personnel',
  '/dashboard/comptabilite': 'Comptabilite',
  '/dashboard/anomalies': 'Anomalies',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/parametres': 'Parametres',
}

export default function Header() {
  const pathname = usePathname()
  const { user, toggleSidebar } = useDashboard()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const pageTitle = pageTitles[pathname] || 'Tableau de bord'
  const unreadCount = 3 // Placeholder

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <div
            className={`
              relative w-full transition-all duration-200
              ${searchFocused ? 'scale-[1.02]' : ''}
            `}
          >
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher medicaments, ventes..."
              className={`
                w-full pl-10 pr-4 py-2.5 rounded-xl text-sm
                bg-slate-100/80 border border-transparent
                text-slate-700 placeholder-slate-400
                focus:outline-none focus:bg-white focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100
                transition-all duration-200
              `}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-200/60 rounded">
              Ctrl+K
            </kbd>
          </div>
        </div>

        {/* Right: Notifications + User */}
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <button className="relative p-2.5 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-4.5 h-4.5 min-w-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-white">
                {unreadCount}
              </span>
            )}
          </button>

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
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg shadow-slate-200/50 border border-slate-200/60 py-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="px-4 py-2.5 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-900">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                </div>
                <div className="py-1">
                  <a
                    href="/dashboard/parametres"
                    className="flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <User className="w-4 h-4" />
                    Mon profil
                  </a>
                  <a
                    href="/dashboard/parametres"
                    className="flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Parametres
                  </a>
                </div>
                <div className="border-t border-slate-100 pt-1">
                  <form action="/api/auth/logout" method="POST">
                    <button
                      type="submit"
                      className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Deconnexion
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
