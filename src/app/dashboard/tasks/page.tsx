import { Metadata } from 'next'
import { TasksPageClient } from './tasks-page-client'

export const metadata: Metadata = {
  title: 'Opgaver',
  description: 'Oversigt over alle opgaver',
}

export const dynamic = 'force-dynamic'

export default function TasksPage() {
  return <TasksPageClient />
}
