'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export interface DashboardUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  pharmacyId: string | null
}

interface DashboardContextType {
  user: DashboardUser
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  permissions: Record<string, boolean>
  permissionsLoaded: boolean
  isImpersonating: boolean
  impersonatingPharmacy: string | null
  exitImpersonation: () => Promise<void>
}

const DashboardContext = createContext<DashboardContextType | null>(null)

export function DashboardProvider({
  children,
  user,
}: {
  children: ReactNode
  user: DashboardUser
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [impersonatingPharmacy, setImpersonatingPharmacy] = useState<string | null>(null)

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  // Load user permissions
  const loadPermissions = useCallback(async () => {
    // SuperAdmin and ADMIN have full access
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      setPermissionsLoaded(true)
      return
    }

    try {
      const res = await fetch(`/api/permissions?userId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setPermissions(data.permissions || {})
      }
    } catch {
      // fallback: empty permissions
    } finally {
      setPermissionsLoaded(true)
    }
  }, [user.id, user.role])

  // Check impersonation state
  const checkImpersonation = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        // The /api/auth/me endpoint will tell us the cookie state
        // We check by looking if there's an impersonation cookie via a special header
        if (data.isImpersonating) {
          setIsImpersonating(true)
          setImpersonatingPharmacy(data.impersonatingPharmacy || null)
        }
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadPermissions()
    checkImpersonation()
  }, [loadPermissions, checkImpersonation])

  const exitImpersonation = async () => {
    try {
      const res = await fetch('/api/superadmin/impersonate', { method: 'DELETE' })
      if (res.ok) {
        window.location.href = '/dashboard/superadmin'
      }
    } catch {
      // ignore
    }
  }

  return (
    <DashboardContext.Provider
      value={{
        user,
        sidebarOpen,
        setSidebarOpen,
        toggleSidebar,
        permissions,
        permissionsLoaded,
        isImpersonating,
        impersonatingPharmacy,
        exitImpersonation,
      }}
    >
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  const context = useContext(DashboardContext)
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider')
  }
  return context
}
