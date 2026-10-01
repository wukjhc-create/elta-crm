import { Metadata } from 'next'
import { TasksPageClient } from './tasks-page-client'
import { MyJobsCard } from './my-jobs-card'
import { MyHoursCard } from './my-hours-card'
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
  // Montørens landingsside: egne job øverst (kalender-scope = kun egne arbejdsordrer)
  const showMyJobs = ctx.has('calendar.view.own') && !ctx.has('calendar.view.all')
  return (
    <>
      {showMyJobs && <MyJobsCard />}
      {showMyJobs && <MyHoursCard />}
      <TasksPageClient
        isMontor={isMontor}
        canManage={canManage}
        graphConfigured={graphConfigured}
      />
    </>
  )
}
