'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Pill,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Calculator,
  AlertTriangle,
  Bell,
  Settings,
  LogOut,
  X,
  Wallet,
} from 'lucide-react'
import { useDashboard } from './DashboardProvider'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Médicaments', href: '/dashboard/medicaments', icon: Pill },
  { name: 'Stock', href: '/dashboard/stock', icon: Package },
  { name: 'Ventes (POS)', href: '/dashboard/ventes', icon: ShoppingCart },
  { name: 'Fournisseurs', href: '/dashboard/fournisseurs', icon: Truck },
  { name: 'Personnel', href: '/dashboard/personnel', icon: Users },
  { name: 'Comptabilité', href: '/dashboard/comptabilite', icon: Calculator },
  { name: 'Paie', href: '/dashboard/paie', icon: Wallet },
  { name: 'Anomalies', href: '/dashboard/anomalies', icon: AlertTriangle },
  { name: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { name: 'Paramètres', href: '/dashboard/parametres', icon: Settings },
]

const roleBadgeColors: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-500/20 text-red-300 border-red-500/30',
  OWNER: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  ADMIN: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  PHARMACIST: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  TECHNICIAN: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  CASHIER: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  ACCOUNTANT: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
}

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  OWNER: 'Propriétaire',
  ADMIN: 'Administrateur',
  PHARMACIST: 'Pharmacien',
  TECHNICIAN: 'Technicien',
  CASHIER: 'Caissier',
  ACCOUNTANT: 'Comptable',
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, sidebarOpen, setSidebarOpen } = useDashboard()

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
      router.refresh()
    } catch { /* silent */ }
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 flex flex-col
          bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950
          border-r border-slate-800/50
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Brand */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-800/50">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/25 group-hover:shadow-emerald-500/40 transition-shadow">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold text-white tracking-tight">
                Neuro<span className="text-emerald-400">Pharm</span>
              </span>
              <p className="text-[10px] text-slate-500 -mt-0.5 tracking-widest uppercase">
                Gestion Pharmacie
              </p>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
          <p className="px-3 mb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Menu principal
          </p>
          {navigation.slice(0, 4).map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-200 group relative
                  ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-400 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }
                `}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-400 rounded-r-full" />
                )}
                <item.icon
                  className={`w-5 h-5 flex-shrink-0 transition-colors ${
                    active
                      ? 'text-emerald-400'
                      : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                />
                {item.name}
              </Link>
            )
          })}

          <p className="px-3 mt-6 mb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Gestion
          </p>
          {navigation.slice(4, 8).map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-200 group relative
                  ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-400 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }
                `}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-400 rounded-r-full" />
                )}
                <item.icon
                  className={`w-5 h-5 flex-shrink-0 transition-colors ${
                    active
                      ? 'text-emerald-400'
                      : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                />
                {item.name}
              </Link>
            )
          })}

          <p className="px-3 mt-6 mb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Système
          </p>
          {navigation.slice(8).map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-200 group relative
                  ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-400 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }
                `}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-400 rounded-r-full" />
                )}
                <item.icon
                  className={`w-5 h-5 flex-shrink-0 transition-colors ${
                    active
                      ? 'text-emerald-400'
                      : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-slate-800/50">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white font-semibold text-sm shadow-lg">
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user.firstName} {user.lastName}
              </p>
              <span
                className={`inline-block mt-0.5 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                  roleBadgeColors[user.role] || roleBadgeColors.CASHIER
                }`}
              >
                {roleLabels[user.role] || user.role}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-700/50 transition-colors"
              title="Déconnexion"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
