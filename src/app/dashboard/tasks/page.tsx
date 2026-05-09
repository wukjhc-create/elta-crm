import { Metadata } from 'next'
import { TasksPageClient } from './tasks-page-client'
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
  return (
    <TasksPageClient
      isMontor={isMontor}
      canManage={canManage}
      graphConfigured={graphConfigured}
    />
  )
}
