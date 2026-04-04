import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { DashboardProvider } from '@/components/DashboardProvider'
import { I18nProvider } from '@/components/I18nProvider'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import ImpersonationBanner from '@/components/ImpersonationBanner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = {
    id: session.id,
    email: session.email,
    firstName: session.firstName,
    lastName: session.lastName,
    role: session.role,
    pharmacyId: session.pharmacyId,
  }

  return (
    <I18nProvider>
      <DashboardProvider user={user}>
        <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
          <ImpersonationBanner />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto p-4 lg:p-6">
                {children}
              </main>
            </div>
          </div>
        </div>
      </DashboardProvider>
    </I18nProvider>
  )
}
