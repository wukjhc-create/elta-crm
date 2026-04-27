import { getAllTasks } from '@/lib/actions/customer-tasks'
import { CalendarPageClient } from './calendar-client'

export const metadata = {
  title: 'Kalender — Besigtigelser',
}

export default async function CalendarPage() {
  const allTasks = await getAllTasks({ search: 'besigtigelse' })

  // Also include tasks with "Besigtigelse" (case variations) or PORTAL bookings
  const besigtigelser = allTasks.filter(
    (t) => t.title.toLowerCase().includes('besigtigelse')
  )

  return <CalendarPageClient tasks={besigtigelser} />
}
