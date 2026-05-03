import type { Metadata } from 'next'
import { getAllTasks } from '@/lib/actions/customer-tasks'
import { listWorkOrdersByDateRange } from '@/lib/actions/work-orders'
import { listEmployeesAction } from '@/lib/actions/employees'
import { CalendarPageClient } from './calendar-client'
import { CalendarWorkforceClient } from './calendar-workforce-client'

export const metadata: Metadata = {
  title: 'Kalender',
  description: 'Dagsoversigt, ugesoversigt og besigtigelseskalender',
}

export const dynamic = 'force-dynamic'

type CalendarView = 'day' | 'week' | 'month'

interface PageProps {
  searchParams: Promise<{
    view?: CalendarView
    date?: string  // YYYY-MM-DD anchor
    employee?: string
    status?: string
  }>
}

// =====================================================
// Date helpers (Monday-based week)
// =====================================================

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  // JS: Sun=0, Mon=1, ..., Sat=6 → make Monday=0, Sunday=6
  const wd = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - wd)
  return dateKey(d)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return dateKey(d)
}

export default async function CalendarPage({ searchParams }: PageProps) {
  const params = await searchParams
  const view: CalendarView = params.view ?? 'day'
  const anchorDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayKey()

  // ----- Month view (legacy customer_tasks/besigtigelser) -----
  if (view === 'month') {
    const allTasks = await getAllTasks({ search: 'besigtigelse' })
    const besigtigelser = allTasks.filter((t) =>
      t.title.toLowerCase().includes('besigtigelse')
    )
    return <CalendarPageClient tasks={besigtigelser} />
  }

  // ----- Day or Week view (work_orders × employees) -----

  // Determine date range based on view
  let rangeStart: string
  let rangeEnd: string
  if (view === 'week') {
    rangeStart = startOfWeek(anchorDate)
    rangeEnd = addDays(rangeStart, 6)
  } else {
    rangeStart = anchorDate
    rangeEnd = anchorDate
  }

  const [workOrdersRes, employees] = await Promise.all([
    listWorkOrdersByDateRange(rangeStart, rangeEnd),
    listEmployeesAction({ active: 'active', limit: 200 }),
  ])

  const workOrders = workOrdersRes.success && workOrdersRes.data ? workOrdersRes.data : []

  return (
    <CalendarWorkforceClient
      view={view}
      anchorDate={anchorDate}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      employees={employees}
      workOrders={workOrders}
      filters={{
        employee: params.employee ?? '',
        status: params.status ?? '',
      }}
      loadError={!workOrdersRes.success ? workOrdersRes.error ?? null : null}
    />
  )
}
