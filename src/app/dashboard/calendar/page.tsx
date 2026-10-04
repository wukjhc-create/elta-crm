import type { Metadata } from 'next'
import { getAllTasks } from '@/lib/actions/customer-tasks'
import { listWorkOrdersByDateRange } from '@/lib/actions/work-orders'
import { listCalendarEmployeesAction } from '@/lib/actions/employees'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'
import { CalendarPageClient } from './calendar-client'
import { CalendarWorkforceClient } from './calendar-workforce-client'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { getPlanningBacklogAction } from '@/lib/actions/planning-backlog'
import { PlanningBacklogPanel } from './planning-backlog-panel'

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
  // Dansk dato (serveren kører i UTC: 00–02 dansk tid viste ellers gårsdagen)
  return copenhagenParts(new Date()).date
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
  // Sprint 7E — accept enten calendar.view.all eller calendar.view.own.
  // Montor faar kun egne work orders via scope-filter i listWorkOrdersByDateRange.
  const canViewAll = await pageHasPermission('calendar.view.all')
  const canViewOwn = await pageHasPermission('calendar.view.own')
  if (!canViewAll && !canViewOwn) {
    return <NoAccess permission="calendar.view.all" />
  }

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
    listCalendarEmployeesAction(),
  ])

  const workOrders = workOrdersRes.success && workOrdersRes.data ? workOrdersRes.data : []
  // N48: sager der mangler planlægning (kun planlæggere)
  const backlog = (await pageHasPermission('work_orders.plan')) ? await getPlanningBacklogAction() : null

  return (
    <>
    {backlog?.success && backlog.data && <div className="px-4 sm:px-6 pt-4"><PlanningBacklogPanel items={backlog.data.items} total={backlog.data.total} /></div>}
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
    </>
  )
}
