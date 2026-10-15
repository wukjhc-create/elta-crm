import { Metadata } from 'next'
import { TasksPageClient } from './tasks-page-client'
import { MyJobsCard } from './my-jobs-card'
import { MyHoursCard } from './my-hours-card'
import { PersonalRemindersCard } from './personal-reminders-card'
import { MyDayTasks } from '@/components/modules/dashboard/my-day-tasks'
import { getMyDayTasks } from '@/lib/actions/customer-tasks'
import { getMyPersonalReminders } from '@/lib/actions/personal-reminders'
import { splitMyDayReminders } from '@/lib/tasks/my-day'
import { getPageRoleContext } from '@/lib/auth/page-guard'
import { isGraphConfigured } from '@/lib/services/microsoft-graph'

export const metadata: Metadata = {
  title: 'Opgaver',
  description: 'Oversigt over opgaver',
}

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  // Sprint 7E fix — montor faar begraenset task-view.
  const ctx = await getPageRoleContext()
  const isMontor = ctx.role === 'montør'
  const canManage = ctx.has('tasks.create') // admin + serviceleder
  // Sprint 8C-1 — saa send-mail-dialogen kan vise advarsel + mailto-fallback
  // hvis Graph ikke er konfigureret i miljøet.
  const graphConfigured = isGraphConfigured()
  const [myDay, personalReminders] = await Promise.all([
    getMyDayTasks(),
    getMyPersonalReminders().catch(() => ({ available: false as const, reminders: [] })),
  ])
  const dayReminders = splitMyDayReminders(personalReminders.reminders)
  // Montørens landingsside: egne job øverst (kalender-scope = kun egne arbejdsordrer)
  const showMyJobs = ctx.has('calendar.view.own') && !ctx.has('calendar.view.all')
  return (
    <>
      {showMyJobs && <MyJobsCard />}
      {showMyJobs && <MyHoursCard />}
      <section className="bg-white rounded-lg border p-4 sm:p-5 mb-6">
        <h2 className="font-semibold mb-3">Mine opgaver</h2>
        <MyDayTasks
          overdue={myDay.overdue}
          today={myDay.today}
          reminderOverdue={dayReminders.overdue}
          reminderToday={dayReminders.today}
          loadError={myDay.error}
        />
      </section>
      <PersonalRemindersCard />
      <TasksPageClient
        isMontor={isMontor}
        canManage={canManage}
        graphConfigured={graphConfigured}
      />
    </>
  )
}
