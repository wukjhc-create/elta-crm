import { Metadata } from 'next'
import { TasksPageClient } from './tasks-page-client'
import { MyJobsCard } from './my-jobs-card'
import { MyHoursCard } from './my-hours-card'
import { PersonalRemindersCard } from './personal-reminders-card'
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
  // X-13/W-8: kun egne opgaver uden customers.view.all (montør) eller uden tasks.view (salg/bogholderi) — taskListScope
  const { taskListScope } = await import('@/lib/tasks/task-scope')
  const ownOnly = taskListScope(ctx.has as (p: never) => boolean) !== 'all'
  const canManage = ctx.has('tasks.create') // admin + serviceleder
  // PM3-8 (rettigheds-audit 2026-10-19): sendTaskEmail kræver tasks.edit — uden den vises mailknappen ikke
  const canMail = ctx.has('tasks.edit')
  // MP-00236: sletteregel pr. opgave (lib/tasks/task-delete-rule) — serveren håndhæver den samme regel
  const { createClient } = await import('@/lib/supabase/server')
  const currentUserId = (await (await createClient()).auth.getUser()).data.user?.id ?? null
  const deleteAbilities = { canDeleteAll: ctx.has('tasks.delete'), canCreateAny: ctx.has('tasks.create'), userId: currentUserId }
  // Sprint 8C-1 — saa send-mail-dialogen kan vise advarsel + mailto-fallback
  // hvis Graph ikke er konfigureret i miljøet.
  const graphConfigured = isGraphConfigured()
  // Montørens landingsside: egne job øverst (kalender-scope = kun egne arbejdsordrer)
  const showMyJobs = ctx.has('calendar.view.own') && !ctx.has('calendar.view.all')
  return (
    <>
      {showMyJobs && <MyJobsCard />}
      {showMyJobs && <MyHoursCard />}
      <PersonalRemindersCard />
      <TasksPageClient
        isMontor={ownOnly}
        canManage={canManage}
        deleteAbilities={deleteAbilities}
        canMail={canMail}
        graphConfigured={graphConfigured}
      />
    </>
  )
}
