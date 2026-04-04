'use client'

import { useDashboard } from './DashboardProvider'
import { Shield, X } from 'lucide-react'

export default function ImpersonationBanner() {
  const { isImpersonating, exitImpersonation } = useDashboard()

  if (!isImpersonating) return null

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium z-50 relative">
      <Shield className="w-4 h-4" />
      <span>Mode impersonation actif — Vous visualisez cette pharmacie en tant que SuperAdmin</span>
      <button
        onClick={exitImpersonation}
        className="flex items-center gap-1.5 ml-4 px-3 py-1 bg-amber-700 text-white rounded-lg hover:bg-amber-800 transition-colors text-xs font-semibold"
      >
        <X className="w-3.5 h-3.5" />
        Quitter
      </button>
    </div>
  )
}
