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
  Building2,
  CreditCard,
  Activity,
  Ticket,
  Shield,
  UserCog,
} from 'lucide-react'
import { useDashboard } from './DashboardProvider'
import { useI18n } from './I18nProvider'

// ============== PHARMACY NAVIGATION ==============
type PharmNavKey = 'dashboard' | 'medications' | 'stock' | 'sales' | 'suppliers' | 'staff' | 'accounting' | 'payroll' | 'anomalies' | 'notifications' | 'settings'

const pharmacyNavDef: Array<{ key: PharmNavKey; menuKey: string; href: string; icon: typeof LayoutDashboard; section: number }> = [
  // Section 0: Main
  { key: 'dashboard', menuKey: 'dashboard', href: '/dashboard', icon: LayoutDashboard, section: 0 },
  { key: 'medications', menuKey: 'medications', href: '/dashboard/medicaments', icon: Pill, section: 0 },
  { key: 'stock', menuKey: 'stock', href: '/dashboard/stock', icon: Package, section: 0 },
  { key: 'sales', menuKey: 'sales', href: '/dashboard/ventes', icon: ShoppingCart, section: 0 },
  // Section 1: Management
  { key: 'suppliers', menuKey: 'suppliers', href: '/dashboard/fournisseurs', icon: Truck, section: 1 },
  { key: 'staff', menuKey: 'staff', href: '/dashboard/personnel', icon: Users, section: 1 },
  { key: 'accounting', menuKey: 'accounting', href: '/dashboard/comptabilite', icon: Calculator, section: 1 },
  { key: 'payroll', menuKey: 'payroll', href: '/dashboard/paie', icon: Wallet, section: 1 },
  // Section 2: System
  { key: 'anomalies', menuKey: 'anomalies', href: '/dashboard/anomalies', icon: AlertTriangle, section: 2 },
  { key: 'notifications', menuKey: 'notifications', href: '/dashboard/notifications', icon: Bell, section: 2 },
  { key: 'settings', menuKey: 'settings', href: '/dashboard/parametres', icon: Settings, section: 2 },
]

// ============== SUPERADMIN NAVIGATION ==============
const superAdminNav = [
  // Section 0: Overview
  { name: 'Tableau de bord SaaS', href: '/dashboard/superadmin', icon: LayoutDashboard, section: 0 },
  // Section 1: Management
  { name: 'Pharmacies', href: '/dashboard/superadmin/pharmacies', icon: Building2, section: 1 },
  { name: 'Utilisateurs', href: '/dashboard/superadmin/utilisateurs', icon: Users, section: 1 },
  { name: 'Abonnements', href: '/dashboard/superadmin/abonnements', icon: CreditCard, section: 1 },
  // Section 2: System
  { name: 'Logs système', href: '/dashboard/superadmin/logs', icon: Activity, section: 2 },
  { name: 'Support', href: '/dashboard/superadmin/support', icon: Ticket, section: 2 },
  { name: 'Paramètres SaaS', href: '/dashboard/superadmin/parametres', icon: Settings, section: 2 },
]

const sectionLabels = {
  pharmacy: [
    { fr: 'Menu principal', en: 'Main Menu' },
    { fr: 'Gestion', en: 'Management' },
    { fr: 'Système', en: 'System' },
  ],
  superadmin: [
    { fr: 'Vue d\'ensemble', en: 'Overview' },
    { fr: 'Gestion SaaS', en: 'SaaS Management' },
    { fr: 'Système', en: 'System' },
  ],
}

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
  const { user, sidebarOpen, setSidebarOpen, permissions, permissionsLoaded } = useDashboard()
  const { t, locale } = useI18n()

  const isSuperAdmin = user.role === 'SUPER_ADMIN'
  const isAdmin = user.role === 'ADMIN'

  // Build pharmacy navigation with i18n + permissions filtering
  const pharmacyNavigation = pharmacyNavDef
    .map(item => ({
      ...item,
      name: t.nav[item.key] || item.key,
    }))
    .filter(item => {
      // Admin always sees everything
      if (isAdmin) return true
      // SuperAdmin in impersonation mode also sees everything
      if (isSuperAdmin) return true
      // Other roles: check permissions
      if (!permissionsLoaded) return item.menuKey === 'dashboard' // show dashboard while loading
      return permissions[item.menuKey] !== false && (permissions[item.menuKey] === true || item.menuKey === 'dashboard')
    })

  // Add permissions management link for Admin users
  const adminExtraNav = isAdmin ? [
    { name: locale === 'fr' ? 'Permissions' : 'Permissions', href: '/dashboard/permissions', icon: UserCog, section: 2, key: 'permissions', menuKey: 'permissions' },
  ] : []

  const allPharmacyNav = [...pharmacyNavigation, ...adminExtraNav]

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    if (href === '/dashboard/superadmin') return pathname === '/dashboard/superadmin'
    return pathname.startsWith(href)
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
      router.refresh()
    } catch { /* silent */ }
  }

  const renderNavLink = (item: { name: string; href: string; icon: typeof LayoutDashboard }) => {
    const active = isActive(item.href)
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setSidebarOpen(false)}
        className={`
          flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
          transition-all duration-200 group relative
          ${active
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
            active ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'
          }`}
        />
        {item.name}
      </Link>
    )
  }

  // Determine which sections to render
  const navItems = isSuperAdmin && !pathname.startsWith('/dashboard/superadmin') === false
    ? superAdminNav
    : isSuperAdmin
    ? superAdminNav
    : allPharmacyNav

  const labels = isSuperAdmin ? sectionLabels.superadmin : sectionLabels.pharmacy
  const langKey = locale === 'en' ? 'en' : 'fr'

  const sections = [0, 1, 2].map(s => navItems.filter(item => item.section === s))

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
          <Link href={isSuperAdmin ? '/dashboard/superadmin' : '/dashboard'} className="flex items-center gap-3 group">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/25 group-hover:shadow-emerald-500/40 transition-shadow">
              {isSuperAdmin ? <Shield className="w-5 h-5 text-white" /> : <Pill className="w-5 h-5 text-white" />}
            </div>
            <div>
              <span className="text-lg font-bold text-white tracking-tight">
                Neuro<span className="text-emerald-400">Pharm</span>
              </span>
              <p className="text-[10px] text-slate-500 -mt-0.5 tracking-widest uppercase">
                {isSuperAdmin ? 'Super Admin' : 'Gestion Pharmacie'}
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
          {sections.map((sectionItems, idx) => {
            if (sectionItems.length === 0) return null
            return (
              <div key={idx}>
                <p className={`px-3 ${idx > 0 ? 'mt-6' : ''} mb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider`}>
                  {labels[idx]?.[langKey] || ''}
                </p>
                {sectionItems.map(item => renderNavLink(item as { name: string; href: string; icon: typeof LayoutDashboard }))}
              </div>
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
              title={t.auth.logout}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
