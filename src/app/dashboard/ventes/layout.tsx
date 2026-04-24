'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingCart, History, BookOpen } from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'
import { useDashboard } from '@/components/DashboardProvider'

export default function VentesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { t } = useI18n()
  const { user, permissions, permissionsLoaded } = useDashboard()

  const canSeeCarnet =
    user.role === 'ADMIN' ||
    user.role === 'SUPER_ADMIN' ||
    (permissionsLoaded && permissions['credit'] === true)

  const tabs = [
    { href: '/dashboard/ventes', label: t.sales.newSale, icon: ShoppingCart, exact: true, visible: true },
    { href: '/dashboard/ventes/historique', label: t.sales.history, icon: History, exact: false, visible: true },
    { href: '/dashboard/ventes/carnet', label: 'Carnet', icon: BookOpen, exact: false, visible: canSeeCarnet },
  ].filter((tab) => tab.visible)

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3 animate-fade-in">
      <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 shadow-sm p-1 w-fit">
        {tabs.map((tab) => {
          const active = isActive(tab.href, tab.exact)
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Link>
          )
        })}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
