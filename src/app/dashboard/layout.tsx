import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { CommandPalette } from '@/components/layout/command-palette'
import { TaskReminderOverlay } from '@/components/layout/task-reminder-overlay'
import { BottomNav } from '@/components/layout/bottom-nav'
import { NotificationsProvider } from '@/components/layout/notifications-provider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <NotificationsProvider>
      <div className="flex h-screen overflow-hidden">
        <CommandPalette />
        {/* Sidebar — hidden on mobile */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <Header />

          {/* Page content — extra bottom padding for mobile bottom nav */}
          {/* MB-2 (mobil-review 2026-10-17): bunden plads til bundmenuen inkl. iPhones hjemmeindikator (før pb-20 = 80 px < 98 px,
              og sm:p-6 nulstillede bunden til 24 px mellem 640 og 767 px) */}
          <main className="flex-1 overflow-y-auto bg-gray-50 px-3 pt-3 sm:px-6 sm:pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
            {children}
          </main>
        </div>

        {/* Bottom navigation — mobile only */}
        <BottomNav />

        <TaskReminderOverlay />
      </div>
    </NotificationsProvider>
  )
}
