'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

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

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  return (
    <DashboardContext.Provider
      value={{ user, sidebarOpen, setSidebarOpen, toggleSidebar }}
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
