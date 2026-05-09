import { Metadata } from 'next'
import { TasksPageClient } from './tasks-page-client'
import { getPageRoleContext } from '@/lib/auth/page-guard'

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
  return (
    <TasksPageClient
      isMontor={isMontor}
      canManage={canManage}
    />
  )
}
