import type { Metadata } from 'next'
import { getAllTasks } from '@/lib/actions/customer-tasks'
import { getMyPersonalReminders } from '@/lib/actions/personal-reminders'
import { ASSISTANT_RULES } from '@/lib/assistant/rules'
import { listWorkOrdersByDateRange } from '@/lib/actions/work-orders'
import { listCalendarEmployeesAction } from '@/lib/actions/employees'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'
import { agendaForDates, type AgendaSource } from '@/lib/calendar/agenda'
import { CalendarPageClient } from './calendar-client'
import { CalendarWorkforceClient } from './calendar-workforce-client'
import { pageHasPermission } from '@/lib/auth/page-guard'
import { NoAccess } from '@/components/auth/no-access'
import { getJobsWithoutTimeAction, getPlanningBacklogAction } from '@/lib/actions/planning-backlog'
import { JobsWithoutTimePanel, PlanningBacklogPanel } from './planning-backlog-panel'

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

function datesFrom(start: string, end: string): string[] {
  const out: string[] = []
  let cursor = start
  while (cursor <= end && out.length < 14) {
    out.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return out
}

/** Samme kilder som månedsvisningen, skåret til de viste datoer. Ingen telefon eller mail. */
async function loadAgenda(dates: string[]) {
  const [allTasks, assistantTasks, mine] = await Promise.all([
    getAllTasks({ search: 'besigtigelse' }),
    getAllTasks({ autoRules: ASSISTANT_RULES }),
    getMyPersonalReminders().catch(() => ({ available: false as const, reminders: [] })),
  ])
  const inspections = allTasks.error ? [] : allTasks.tasks.filter((task) => task.title.toLowerCase().includes('besigtigelse'))
  const seen = new Set(inspections.map((task) => task.id))
  const sources: AgendaSource[] = [
    ...inspections.map((task) => taskSource(task, 'inspection')),
    ...(assistantTasks.error ? [] : assistantTasks.tasks.filter((task) => !seen.has(task.id)).map((task) => taskSource(task, 'callback'))),
    ...mine.reminders.map((reminder) => ({
      id: reminder.id,
      title: reminder.title,
      at: reminder.due_at,
      status: reminder.status,
      kind: 'reminder' as const,
    })),
  ]
  return {
    items: agendaForDates(sources, dates),
    error: allTasks.error || assistantTasks.error,
  }
}

function taskSource(task: { id: string; title: string; due_date: string | null; status: string; description?: string | null; customer?: { id: string; company_name: string | null } | null }, kind: 'inspection' | 'callback'): AgendaSource {
  return {
    id: task.id,
    title: task.title,
    at: task.due_date,
    status: task.status,
    kind,
    description: task.description,
    customerId: task.customer?.id ?? null,
    customerName: task.customer?.company_name ?? null,
  }
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
    // Besigtigelser + opkald/påmindelser oprettet via ELTA Assistant (T2 — CRM-kalenderen er stedet de ses)
    const [allTasks, assistantTasks] = await Promise.all([
      getAllTasks({ search: 'besigtigelse' }),
      getAllTasks({ autoRules: ASSISTANT_RULES }),
    ])
    const besigtigelser = allTasks.error ? [] : allTasks.tasks.filter((t) =>
      t.title.toLowerCase().includes('besigtigelse')
    )
    const seen = new Set(besigtigelser.map((t) => t.id))
    // Mine personlige påmindelser (00197; tom hvor tabellen ikke findes)
    const mine = await getMyPersonalReminders().catch(() => ({ available: false, reminders: [] }))
    const personalReminders = mine.reminders.map((r) => ({ id: r.id, title: r.title, due_at: r.due_at, status: r.status }))
    return <CalendarPageClient tasks={[...besigtigelser, ...(assistantTasks.error ? [] : assistantTasks.tasks.filter((t) => !seen.has(t.id)))]} personalReminders={personalReminders} tasksError={allTasks.error || assistantTasks.error} />
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

  const [workOrdersRes, employeesResult, agenda] = await Promise.all([
    listWorkOrdersByDateRange(rangeStart, rangeEnd),
    listCalendarEmployeesAction()
      .then((rows) => ({ rows, error: null as string | null }))
      .catch(() => ({ rows: [], error: 'Kunne ikke hente medarbejdere. Det tælles ikke som ingen.' })),
    loadAgenda(datesFrom(rangeStart, rangeEnd)),
  ])
  const employees = employeesResult.rows

  const workOrders = workOrdersRes.success && workOrdersRes.data ? workOrdersRes.data : []
  // N48: sager der mangler planlægning (kun planlæggere)
  // N62: overståede job uden registreret tid (kun planlæggere)
  const canPlan = await pageHasPermission('work_orders.plan')
  const [backlog, noTime] = canPlan ? await Promise.all([getPlanningBacklogAction(), getJobsWithoutTimeAction()]) : [null, null]

  return (
    <>
    {backlog?.success && backlog.data && <div className="px-4 sm:px-6 pt-4"><PlanningBacklogPanel items={backlog.data.items} total={backlog.data.total} /></div>}
    {canPlan && backlog && !backlog.success && (
      <p className="px-4 sm:px-6 pt-4 text-sm text-red-700" data-testid="planning-backlog-load-error">
        {backlog.error ?? 'Kunne ikke hente sager uden plan'}. Det tælles ikke som ingen sager.
      </p>
    )}
    {noTime?.success && noTime.data && <div className="px-4 sm:px-6 pt-4"><JobsWithoutTimePanel items={noTime.data.items} total={noTime.data.total} /></div>}
    {canPlan && noTime && !noTime.success && (
      <p className="px-4 sm:px-6 pt-4 text-sm text-red-700" data-testid="jobs-without-time-load-error">
        {noTime.error ?? 'Kunne ikke hente job uden timer'}. Det tælles ikke som at tiden er registreret.
      </p>
    )}
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
      employeesError={employeesResult.error}
      relationsError={
        workOrdersRes.success && workOrdersRes.employees_failed && workOrdersRes.cases_failed
          ? 'Medarbejdere og sager kunne ikke hentes. Det tælles ikke som ikke tildelt.'
          : workOrdersRes.success && workOrdersRes.employees_failed
            ? 'Medarbejdere kunne ikke hentes. Det tælles ikke som ikke tildelt.'
            : workOrdersRes.success && workOrdersRes.cases_failed
              ? 'Sager kunne ikke hentes. Det tælles ikke som uden sag.'
              : null
      }
      agenda={agenda.items}
      agendaError={agenda.error}
    />
    </>
  )
}
