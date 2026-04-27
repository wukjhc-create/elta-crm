import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { CommandPalette } from '@/components/layout/command-palette'
import { TaskReminderOverlay } from '@/components/layout/task-reminder-overlay'
import { BottomNav } from '@/components/layout/bottom-nav'

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
        <main className="flex-1 overflow-y-auto bg-gray-50 p-3 sm:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Bottom navigation — mobile only */}
      <BottomNav />

      <TaskReminderOverlay />
    </div>
  )
}
