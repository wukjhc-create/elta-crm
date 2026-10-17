'use client'

/**
 * Sprint 4D-1 — Workforce calendar (day + week views).
 *
 * Layout:
 *  - Header: title + view toggle (Dag / Uge / Måned) + date navigation
 *  - Filter bar: medarbejder, status
 *  - Body:
 *      DAY view:  rows = active employees, single column for the chosen date
 *      WEEK view: rows = active employees, cols = Mon..Sun
 *  - Empty states for: no employees, no work_orders, employee without WOs
 *
 * Month view is rendered by the existing CalendarPageClient (preserved).
 */

import { copenhagenParts } from '@/lib/utils/copenhagen-time'
import { holidayName } from '@/lib/planning/danish-holidays'
import { ABSENCE_CONFLICT_PREFIX, absenceLabel, absenceOn, isAbsenceConflict, type AbsenceRow } from '@/lib/planning/absence'
import { updateWorkOrderPlanning } from '@/lib/actions/work-orders'
import { formatWorkOrderTime } from '@/lib/planning/work-order-time'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { hasPermission } from '@/lib/auth/permissions'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition, useMemo, createContext, useContext } from 'react'
import { ChevronLeft, ChevronRight, CalendarCheck, Briefcase, AlertCircle, Plus } from 'lucide-react'
import {
  EMPLOYEE_ROLE_OPTIONS,
  type EmployeeRow,
} from '@/types/employees.types'
import type { WorkOrderForCalendar } from '@/lib/actions/work-orders'
import type { WorkOrderStatus } from '@/types/workforce.types'
import { PlanWorkOrderDialog } from './plan-work-order-dialog'
import { EditWorkOrderDialog } from './edit-work-order-dialog'

// Local context: chip click handler shared across all rows
const ChipClickContext = createContext<(wo: WorkOrderForCalendar) => void>(() => {})
// E-7 (Henrik-kø 2026-10-15): træk-og-slip omplanlægning i ugevisningen (kun planlæggere; aktive job)
const DragCtx = createContext<{ enabled: boolean; onDrop: (workOrderId: string, employeeId: string, date: string) => void }>({ enabled: false, onDrop: () => {} })
const WO_DRAG_TYPE = 'application/x-elta-work-order'

type CalendarView = 'day' | 'week' | 'month'

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  planned: 'Planlagt',
  in_progress: 'I gang',
  done: 'Afsluttet',
  cancelled: 'Annulleret',
}

const STATUS_COLORS: Record<WorkOrderStatus, string> = {
  planned: 'bg-blue-100 text-blue-800 ring-blue-200',
  in_progress: 'bg-yellow-100 text-yellow-800 ring-yellow-200',
  done: 'bg-green-100 text-green-800 ring-green-200',
  cancelled: 'bg-gray-100 text-gray-600 ring-gray-200',
}

const WEEKDAY_NAMES = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']
const ROLE_LABEL = new Map(EMPLOYEE_ROLE_OPTIONS.map((r) => [r.value, r.label]))

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayKey(): string {
  // FW-14 (montør-review 2026-10-17): dansk kalenderdag — komponenten server-renderes i UTC (før "i går" 00–02)
  return copenhagenParts(new Date()).date
}

function fmtDate(s: string): string {
  const d = new Date(s + 'T12:00:00')
  return d.toLocaleDateString('da-DK', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function fmtShortDate(s: string): string {
  const d = new Date(s + 'T12:00:00')
  return d.toLocaleDateString('da-DK', {
    day: '2-digit',
    month: 'short',
  })
}

interface FiltersState {
  employee?: string
  status?: string
}

export function CalendarWorkforceClient({
  view,
  anchorDate,
  rangeStart,
  rangeEnd,
  employees,
  workOrders,
  filters,
  loadError,
  absences = [],
  absenceLoadFailed = false,
}: {
  absences?: AbsenceRow[]
  absenceLoadFailed?: boolean
  view: CalendarView
  anchorDate: string
  rangeStart: string
  rangeEnd: string
  employees: EmployeeRow[]
  workOrders: WorkOrderForCalendar[]
  filters: FiltersState
  loadError: string | null
}) {
  const router = useRouter()
  const { role } = useUserRole()
  const canPlan = hasPermission(role, 'work_orders.plan')
  const canManageEmployees = hasPermission(role, 'employees.view')
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  // E-7 (fokus E 2026-10-15): klik på en tom celle i ugevisningen → planlæg med medarbejder + dato udfyldt
  const [planPreset, setPlanPreset] = useState<{ date: string; employeeId: string } | null>(null)
  const openPlan = (preset: { date: string; employeeId: string } | null) => { setPlanPreset(preset); setPlanDialogOpen(true) }
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrderForCalendar | null>(null)
  const [dropMsg, setDropMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const onDropWorkOrder = async (workOrderId: string, employeeId: string, date: string) => {
    const wo = workOrders.find((w) => w.id === workOrderId)
    if (!wo) return
    const sameEmp = (wo.assigned_employee_id ?? '') === employeeId
    const sameDay = (wo.scheduled_date ?? '').slice(0, 10) === date
    if (sameEmp && sameDay) return
    const patch = { scheduled_date: sameDay ? undefined : date, assigned_employee_id: sameEmp ? undefined : employeeId }
    let res = await updateWorkOrderPlanning(workOrderId, patch)
    // 00228: fravær → eksplicit bekræftelse (audit på serveren)
    if (!res.success && isAbsenceConflict(res.error)) {
      if (!window.confirm((res.error ?? '').slice(ABSENCE_CONFLICT_PREFIX.length).trim())) { setDropMsg({ ok: false, text: 'Ikke flyttet — medarbejderen har fravær den dag' }); return }
      res = await updateWorkOrderPlanning(workOrderId, { ...patch, override_absence: true })
    }
    if (!res.success) { setDropMsg({ ok: false, text: res.error ?? 'Kunne ikke flytte arbejdsordren' }); return }
    setDropMsg({ ok: true, text: `"${wo.title}" flyttet` })
    startTransition(() => router.refresh())
  }

  const updateParam = (changes: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    for (const [k, v] of Object.entries(changes)) {
      if (v && v.length > 0) params.set(k, v)
      else params.delete(k)
    }
    startTransition(() =>
      router.push(`/dashboard/calendar?${params.toString()}`)
    )
  }

  // Apply client filters
  const filteredWOs = useMemo(() => {
    return workOrders.filter((w) => {
      if (filters.employee && w.assigned_employee_id !== filters.employee) return false
      if (filters.status && w.status !== filters.status) return false
      return true
    })
  }, [workOrders, filters])

  // X4 (planlægnings-review 2026-10-07): arbejdsordrer tildelt en medarbejder der ikke (længere) er på listen over aktive
  // — fx deaktiveret montør — forsvandt fra kalenderen. De vises nu i "Ikke tildelt"-rækken, så de bliver omplanlagt.
  const activeEmployeeIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees])
  const isUnassigned = (w: WorkOrderForCalendar) => !w.assigned_employee_id || !activeEmployeeIds.has(w.assigned_employee_id)

  // Group filtered WOs by date and employee
  const byDateThenEmployee = useMemo(() => {
    const map = new Map<string, Map<string, WorkOrderForCalendar[]>>()
    for (const wo of filteredWOs) {
      if (!wo.scheduled_date) continue
      const dk = wo.scheduled_date.slice(0, 10)
      const empKey = wo.assigned_employee_id && activeEmployeeIds.has(wo.assigned_employee_id) ? wo.assigned_employee_id : '__unassigned__'
      if (!map.has(dk)) map.set(dk, new Map())
      const empMap = map.get(dk)!
      if (!empMap.has(empKey)) empMap.set(empKey, [])
      empMap.get(empKey)!.push(wo)
    }
    return map
  }, [filteredWOs, activeEmployeeIds])

  // Detect if any unassigned WOs exist in the visible range
  const hasUnassigned = useMemo(
    () => filteredWOs.some(isUnassigned),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredWOs, activeEmployeeIds]
  )

  // Filter to only employees that have any WO in the range, OR show all
  // active when there are no WOs (so we still see the table layout).
  const employeesWithRows: EmployeeRow[] = useMemo(() => {
    if (employees.length === 0) return []
    return employees
  }, [employees])

  // Compute prev/next anchor based on view
  const stepBack = (): string => {
    const d = new Date(anchorDate + 'T12:00:00')
    if (view === 'week') d.setDate(d.getDate() - 7)
    else d.setDate(d.getDate() - 1)
    return dateKey(d)
  }
  const stepForward = (): string => {
    const d = new Date(anchorDate + 'T12:00:00')
    if (view === 'week') d.setDate(d.getDate() + 7)
    else d.setDate(d.getDate() + 1)
    return dateKey(d)
  }

  // Build column dates for week view (Mon..Sun)
  const weekDates: string[] = useMemo(() => {
    if (view !== 'week') return [anchorDate]
    const days: string[] = []
    const start = new Date(rangeStart + 'T12:00:00')
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      days.push(dateKey(d))
    }
    return days
  }, [view, rangeStart, anchorDate])

  return (
    <DragCtx.Provider value={{ enabled: canPlan, onDrop: (id, emp, d) => { void onDropWorkOrder(id, emp, d) } }}>
    <AbsenceCtx.Provider value={{ absences, anchorDate }}>
    <ChipClickContext.Provider value={(wo) => setSelectedWorkOrder(wo)}>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarCheck className="w-7 h-7 text-emerald-600" />
            Kalender
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {view === 'day' && fmtDate(anchorDate)}
            {view === 'day' && holidayName(anchorDate) && <span className="ml-2 text-red-700 font-medium" data-testid="calendar-holiday">· {holidayName(anchorDate)}</span>}
            {view === 'week' && (
              <>
                Uge: {fmtShortDate(rangeStart)} – {fmtShortDate(rangeEnd)}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Planlæg opgave — kun planlæggere (work_orders.plan) */}
          {canPlan && (
          <button
            type="button"
            onClick={() => openPlan(null)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" />
            Planlæg opgave
          </button>
          )}

          {/* View toggle */}
          <div className="inline-flex rounded-lg ring-1 ring-gray-200 overflow-hidden">
            {(['day', 'week', 'month'] as CalendarView[]).map((v) => (
              <button
                key={v}
                onClick={() => updateParam({ view: v })}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  view === v
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {v === 'day' && 'Dag'}
                {v === 'week' && 'Uge'}
                {v === 'month' && 'Måned (besigtigelser)'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {dropMsg && (
        <div className={`rounded-lg px-3 py-2 text-sm ring-1 ${dropMsg.ok ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-red-50 text-red-900 ring-red-200'}`} role="status" data-testid="calendar-drop-msg">
          {dropMsg.text}
        </div>
      )}

      {/* Planlæg-dialog */}
      <PlanWorkOrderDialog
        open={planDialogOpen}
        onClose={() => setPlanDialogOpen(false)}
        defaultDate={planPreset?.date ?? anchorDate}
        defaultEmployeeId={planPreset?.employeeId ?? (filters.employee || null)}
        employees={employees}
      />

      {/* Date nav */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => updateParam({ date: stepBack() })}
          className="p-3 sm:p-2 hover:bg-gray-100 rounded-lg"
          title="Forrige"
          aria-label="Forrige"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => updateParam({ date: todayKey() })}
          className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
        >
          I dag
        </button>
        <input
          type="date"
          value={anchorDate}
          onChange={(e) => {
            if (e.target.value) updateParam({ date: e.target.value })
          }}
          className="px-2 py-1 border rounded text-sm"
        />
        <button
          onClick={() => updateParam({ date: stepForward() })}
          className="p-3 sm:p-2 hover:bg-gray-100 rounded-lg"
          title="Næste"
          aria-label="Næste"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Medarbejder</label>
          <select
            value={filters.employee ?? ''}
            onChange={(e) => updateParam({ employee: e.target.value || null })}
            className="border rounded px-2 py-1.5 text-sm bg-white"
          >
            <option value="">Alle</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            value={filters.status ?? ''}
            onChange={(e) => updateParam({ status: e.target.value || null })}
            className="border rounded px-2 py-1.5 text-sm bg-white"
          >
            <option value="">Alle</option>
            {(['planned', 'in_progress', 'done', 'cancelled'] as WorkOrderStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {(filters.employee || filters.status) && (
          <button
            className="text-xs text-emerald-700 hover:underline pb-2"
            onClick={() => updateParam({ employee: null, status: null })}
          >
            Nulstil filtre
          </button>
        )}

        <div className="ml-auto text-xs text-gray-500">
          {filteredWOs.length} arbejdsordre{filteredWOs.length === 1 ? '' : 'r'} i visningen
        </div>
      </div>

      {absenceLoadFailed && (
        <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-sm text-amber-900 flex items-center gap-2" role="alert" data-testid="calendar-absence-load-failed">
          <AlertCircle className="w-4 h-4" />
          Fravær kunne ikke hentes — kalenderen viser ikke ferie/sygdom lige nu. Genindlæs før du planlægger.
        </div>
      )}
      {loadError && (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Kunne ikke hente arbejdsordrer: {loadError}
        </div>
      )}

      {/* Empty state — no employees */}
      {employeesWithRows.length === 0 && (
        <div className="text-center py-16 bg-white rounded-lg ring-1 ring-gray-200">
          {!canManageEmployees ? (
            <>
              <h3 className="text-base font-medium text-gray-700">Din bruger er ikke koblet til en medarbejder</h3>
              <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                Bed kontoret om at koble din login til din medarbejderprofil — så vises dine job her.
              </p>
            </>
          ) : (
          <>
          <h3 className="text-base font-medium text-gray-700">Ingen aktive medarbejdere</h3>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Opret medarbejdere først for at kunne planlægge arbejdsordrer på dem.
          </p>
          <Link
            href="/dashboard/employees/new"
            className="mt-4 inline-flex items-center gap-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            + Opret medarbejder
          </Link>
          </>
          )}
        </div>
      )}

      {/* Body — Day view */}
      {view === 'day' && employeesWithRows.length > 0 && (
        <DayView
          employees={employeesWithRows}
          date={anchorDate}
          byDateThenEmployee={byDateThenEmployee}
          hasUnassigned={hasUnassigned}
          canPlan={canPlan}
        />
      )}

      {/* Body — Week view */}
      {view === 'week' && employeesWithRows.length > 0 && (
        <WeekView
          employees={employeesWithRows}
          weekDates={weekDates}
          byDateThenEmployee={byDateThenEmployee}
          hasUnassigned={hasUnassigned}
          onPlanCell={canPlan ? (employeeId, date) => openPlan({ employeeId, date }) : undefined}
        />
      )}

      {/* Edit / quick-actions dialog */}
      <EditWorkOrderDialog
        open={selectedWorkOrder !== null}
        onClose={() => setSelectedWorkOrder(null)}
        workOrder={selectedWorkOrder}
        employees={employees}
      />
    </div>
    </ChipClickContext.Provider>
    </AbsenceCtx.Provider>
    </DragCtx.Provider>
  )
}

// =====================================================
// Day view
// =====================================================

function DayView({
  employees,
  date,
  byDateThenEmployee,
  hasUnassigned,
  canPlan,
}: {
  canPlan: boolean
  employees: EmployeeRow[]
  date: string
  byDateThenEmployee: Map<string, Map<string, WorkOrderForCalendar[]>>
  hasUnassigned: boolean
}) {
  const empMap = byDateThenEmployee.get(date) ?? new Map<string, WorkOrderForCalendar[]>()
  const totalCount = Array.from(empMap.values()).reduce((s, arr) => s + arr.length, 0)

  if (totalCount === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-lg ring-1 ring-gray-200">
        <h3 className="text-base font-medium text-gray-700">Ingen planlagte opgaver</h3>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
          Der er ikke planlagt nogen arbejdsordrer for {fmtDate(date)}.
          {/* fokus E 2026-10-15: montøren kan ikke planlægge — henvis til egne åbne job i stedet */}
          {canPlan ? ' Åbn en sag og brug "Planlæg medarbejder" til at tilføje en.' : ' Se dine åbne job fra andre dage under "Mine job".'}
        </p>
        {!canPlan && (
          <Link href="/dashboard/tasks" className="inline-block mt-3 text-sm text-emerald-700 hover:underline">Gå til Mine job</Link>
        )}
      </div>
    )
  }

  return (
    // PL-9 (planlægnings-review 2026-10-14): smallere medarbejderkolonne på mobil + vandret scroll (før ~80 px til job)
    <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-x-auto">
      <table className="w-full md:min-w-[480px] text-sm">
        <thead className="bg-gray-50 text-xs text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left w-32 md:w-64">Medarbejder</th>
            <th className="px-3 py-2 text-left">Planlagte arbejdsordrer</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {employees.map((emp) => {
            const wos = empMap.get(emp.id) ?? []
            return <EmployeeRow key={emp.id} employee={emp} workOrders={wos} />
          })}
          {hasUnassigned && (empMap.get('__unassigned__')?.length ?? 0) > 0 && (
            <UnassignedRow workOrders={empMap.get('__unassigned__')!} />
          )}
        </tbody>
      </table>
    </div>
  )
}

function EmployeeRow({
  employee,
  workOrders,
}: {
  employee: EmployeeRow
  workOrders: WorkOrderForCalendar[]
}) {
  const roleLabel = ROLE_LABEL.get(employee.role as any) ?? employee.role
  const { absences, anchorDate } = useContext(AbsenceCtx)
  const absent = absenceOn(absences, employee.id, anchorDate)
  return (
    <tr className="align-top">
      <td className="px-3 py-3 w-32 md:w-64">
        <Link
          href={`/dashboard/employees/${employee.id}`}
          className="font-medium text-gray-900 hover:text-emerald-700 hover:underline"
        >
          {employee.name || '—'}
        </Link>
        <div className="text-xs text-gray-500">{roleLabel}</div>
        {absent && <AbsenceBadge kind={absent.kind} />}
      </td>
      <td className="px-3 py-3">
        {workOrders.length === 0 ? (
          <span className="text-xs italic text-gray-400">Ingen opgaver i dag</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {workOrders.map((wo) => (
              <WorkOrderChip key={wo.id} wo={wo} />
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}

function UnassignedRow({ workOrders }: { workOrders: WorkOrderForCalendar[] }) {
  return (
    <tr className="align-top bg-amber-50/50">
      <td className="px-3 py-3 w-32 md:w-64">
        <span className="font-medium text-amber-900 flex items-center gap-1">
          <AlertCircle className="w-4 h-4" /> Ikke tildelt
        </span>
        <span className="text-xs text-amber-700">Mangler (aktiv) medarbejder — omplanlæg</span>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-2">
          {workOrders.map((wo) => (
            <WorkOrderChip key={wo.id} wo={wo} />
          ))}
        </div>
      </td>
    </tr>
  )
}

// =====================================================
// Week view
// =====================================================

function WeekView({
  employees,
  weekDates,
  byDateThenEmployee,
  hasUnassigned,
  onPlanCell,
}: {
  onPlanCell?: (employeeId: string, date: string) => void
  employees: EmployeeRow[]
  weekDates: string[]
  byDateThenEmployee: Map<string, Map<string, WorkOrderForCalendar[]>>
  hasUnassigned: boolean
}) {
  const today = todayKey()
  const empName = new Map(employees.map((e) => [e.id, e.name || '—']))
  return (
    <>
    {/* E-9 (fokus E 2026-10-15): på mobil en dag-for-dag-agenda i stedet for 7 × 140 px kolonner med sidelæns scroll */}
    <div className="md:hidden space-y-2" data-testid="week-agenda">
      {weekDates.map((d, i) => {
        const empMap = byDateThenEmployee.get(d) ?? new Map<string, WorkOrderForCalendar[]>()
        const entries = Array.from(empMap.entries()).filter(([, wos]) => wos.length > 0)
        return (
          <div key={d} className={`bg-white rounded-lg ring-1 ring-gray-200 p-3 ${d === today ? 'ring-emerald-300' : ''}`}>
            <div className={`text-sm font-medium mb-1.5 ${d === today ? 'text-emerald-800' : 'text-gray-800'}`}>
              {WEEKDAY_NAMES[i]} <span className="text-xs text-gray-500 font-normal">{fmtShortDate(d)}</span>
              {holidayName(d) && <span className="ml-1 text-[10px] font-semibold uppercase text-red-700" data-testid="calendar-holiday">{holidayName(d)}</span>}
            </div>
            {entries.length === 0 ? (
              <p className="text-xs text-gray-400">Intet planlagt</p>
            ) : (
              <div className="space-y-2">
                {entries.map(([empId, wos]) => (
                  <div key={empId}>
                    <div className="text-[11px] text-gray-500 mb-0.5">{empId === '__unassigned__' ? 'Ikke tildelt / inaktiv' : empName.get(empId) ?? '—'}</div>
                    <div className="space-y-1">
                      {wos.map((wo) => <WorkOrderChip key={wo.id} wo={wo} compact />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
    <div className="hidden md:block bg-white rounded-lg ring-1 ring-gray-200 overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-50 text-xs text-gray-600 sticky top-0">
          <tr>
            <th className="px-3 py-2 text-left w-48 border-r">Medarbejder</th>
            {weekDates.map((d, i) => {
              const isToday = d === today
              return (
                <th
                  key={d}
                  className={`px-2 py-2 text-left border-r last:border-r-0 ${
                    isToday ? 'bg-emerald-50 text-emerald-900' : ''
                  }`}
                >
                  <div className="font-medium">{WEEKDAY_NAMES[i]}</div>
                  <div className="text-[11px] text-gray-500 font-normal">
                    {fmtShortDate(d)}
                    {holidayName(d) && <div className="text-[10px] font-semibold text-red-700 truncate" data-testid="calendar-holiday">{holidayName(d)}</div>}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {employees.map((emp) => (
            <WeekEmployeeRow
              key={emp.id}
              employee={emp}
              weekDates={weekDates}
              byDateThenEmployee={byDateThenEmployee}
              onPlanCell={onPlanCell}
            />
          ))}
          {hasUnassigned && (
            <WeekUnassignedRow
              weekDates={weekDates}
              byDateThenEmployee={byDateThenEmployee}
            />
          )}
        </tbody>
      </table>
    </div>
    </>
  )
}

function WeekEmployeeRow({
  employee,
  weekDates,
  byDateThenEmployee,
  onPlanCell,
}: {
  onPlanCell?: (employeeId: string, date: string) => void
  employee: EmployeeRow
  weekDates: string[]
  byDateThenEmployee: Map<string, Map<string, WorkOrderForCalendar[]>>
}) {
  const today = todayKey()
  const roleLabel = ROLE_LABEL.get(employee.role as any) ?? employee.role
  const { absences } = useContext(AbsenceCtx)
  const drag = useContext(DragCtx)
  const [dropOver, setDropOver] = useState<string | null>(null)
  // Fokus E 2026-10-15: belastning — aktive job (planlagt/i gang) pr. dag og uge
  const active = (wos: WorkOrderForCalendar[]) => wos.filter((w) => w.status === 'planned' || w.status === 'in_progress').length
  const weekActive = weekDates.reduce((n, d) => n + active(byDateThenEmployee.get(d)?.get(employee.id) ?? []), 0)
  // 00229: planlagte (estimerede) timer mod normtimer — tom norm = "Norm ikke sat" (ingen 37-fallback)
  const plannedHours = weekDates.reduce((n, d) => n + (byDateThenEmployee.get(d)?.get(employee.id) ?? [])
    .filter((w) => w.status === 'planned' || w.status === 'in_progress')
    .reduce((a, w) => a + (Number(w.estimated_hours ?? 0) || 0), 0), 0)
  const norm = employee.weekly_hours == null ? null : Number(employee.weekly_hours)
  const h1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString('da-DK')
  return (
    <tr className="align-top">
      <td className="px-3 py-2 w-48 border-r">
        <Link
          href={`/dashboard/employees/${employee.id}`}
          className="font-medium text-gray-900 hover:text-emerald-700 hover:underline truncate block"
        >
          {employee.name || '—'}
        </Link>
        <div className="text-[11px] text-gray-500 truncate">{roleLabel}</div>
        <div className="text-[11px] text-gray-500" data-testid="week-employee-load">{weekActive} aktive job denne uge</div>
        <div className={`text-[11px] ${norm != null && plannedHours > norm ? 'text-red-600 font-medium' : 'text-gray-500'}`} data-testid="week-employee-capacity">
          {norm == null ? 'Norm ikke sat' : `Planlagt ${h1(plannedHours)} t af norm ${h1(norm)} t`}
        </div>
      </td>
      {weekDates.map((d) => {
        const isToday = d === today
        const wos = byDateThenEmployee.get(d)?.get(employee.id) ?? []
        const dayActive = active(wos)
        const absent = absenceOn(absences, employee.id, d)
        return (
          <td
            key={d}
            className={`px-1.5 py-2 border-r last:border-r-0 align-top min-w-[140px] ${
              absent ? 'bg-red-50/50' : isToday ? 'bg-emerald-50/40' : ''
            } ${dropOver === d ? 'outline outline-2 outline-emerald-400' : ''}`}
            data-testid="week-cell"
            data-employee-id={employee.id}
            data-date={d}
            onDragOver={drag.enabled ? (e) => { if (e.dataTransfer.types.includes(WO_DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropOver !== d) setDropOver(d) } } : undefined}
            onDragLeave={drag.enabled ? () => setDropOver(null) : undefined}
            onDrop={drag.enabled ? (e) => { e.preventDefault(); setDropOver(null); const id = e.dataTransfer.getData(WO_DRAG_TYPE); if (id) drag.onDrop(id, employee.id, d) } : undefined}
          >
            {absent && <AbsenceBadge kind={absent.kind} />}
            {wos.length === 0 ? (
              onPlanCell ? (
                <button
                  type="button"
                  onClick={() => onPlanCell(employee.id, d)}
                  className="w-full h-8 rounded border border-dashed border-transparent text-[11px] text-gray-300 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50/50"
                  aria-label={`Planlæg ${employee.name || 'medarbejder'} ${d}`}
                  data-testid="week-plan-cell"
                >
                  + Planlæg
                </button>
              ) : (
                <span className="text-[10px] text-gray-300">—</span>
              )
            ) : (
              <div className="space-y-1">
                {dayActive >= 2 && (
                  <div className="text-[10px] font-medium text-amber-800 bg-amber-50 rounded px-1" data-testid="week-day-overload">{dayActive} job samme dag</div>
                )}
                {wos.map((wo) => (
                  <WorkOrderChip key={wo.id} wo={wo} compact />
                ))}
              </div>
            )}
          </td>
        )
      })}
    </tr>
  )
}

// 00228 (Henrik 2026-10-15): fravær i kalenderen — kun type (ingen detaljer)
const AbsenceCtx = createContext<{ absences: AbsenceRow[]; anchorDate: string }>({ absences: [], anchorDate: '' })

function AbsenceBadge({ kind }: { kind: string }) {
  return (
    <div className="mb-1 inline-block text-[10px] font-semibold uppercase tracking-wide rounded bg-red-100 text-red-800 px-1.5 py-0.5" data-testid="calendar-absence">
      {absenceLabel(kind)}
    </div>
  )
}

function WeekUnassignedRow({
  weekDates,
  byDateThenEmployee,
}: {
  weekDates: string[]
  byDateThenEmployee: Map<string, Map<string, WorkOrderForCalendar[]>>
}) {
  const hasAny = weekDates.some(
    (d) => (byDateThenEmployee.get(d)?.get('__unassigned__')?.length ?? 0) > 0
  )
  if (!hasAny) return null
  return (
    <tr className="align-top bg-amber-50/30">
      <td className="px-3 py-2 w-48 border-r">
        <span className="font-medium text-amber-900 text-xs flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> Ikke tildelt / inaktiv
        </span>
      </td>
      {weekDates.map((d) => {
        const wos = byDateThenEmployee.get(d)?.get('__unassigned__') ?? []
        return (
          <td key={d} className="px-1.5 py-2 border-r last:border-r-0 align-top min-w-[140px]">
            {wos.length === 0 ? (
              <span className="text-[10px] text-gray-300">—</span>
            ) : (
              <div className="space-y-1">
                {wos.map((wo) => (
                  <WorkOrderChip key={wo.id} wo={wo} compact />
                ))}
              </div>
            )}
          </td>
        )
      })}
    </tr>
  )
}

// =====================================================
// Chip
// =====================================================

function WorkOrderChip({
  wo,
  compact,
}: {
  wo: WorkOrderForCalendar
  compact?: boolean
}) {
  const onChipClick = useContext(ChipClickContext)
  const drag = useContext(DragCtx)
  const status = wo.status as WorkOrderStatus
  const canDrag = drag.enabled && (status === 'planned' || status === 'in_progress')
  const colorClass = STATUS_COLORS[status]

  const projectLabel =
    wo.case?.project_name ||
    wo.case?.title ||
    wo.title

  const customerLabel = wo.case?.customer_name ?? null
  const caseNumber = wo.case?.case_number ?? null

  return (
    <button
      type="button"
      onClick={() => onChipClick(wo)}
      draggable={canDrag}
      onDragStart={canDrag ? (e) => { e.dataTransfer.setData(WO_DRAG_TYPE, wo.id); e.dataTransfer.effectAllowed = 'move' } : undefined}
      data-testid="wo-chip"
      data-wo-id={wo.id}
      title={`Åbn arbejdsordre${caseNumber ? ` (${caseNumber})` : ''}${canDrag ? ' — træk for at flytte' : ''}`}
      className={`block text-left px-2 py-1.5 rounded ring-1 ${colorClass} ${
        compact ? 'text-[11px]' : 'text-xs'
      } w-full max-w-[260px] hover:ring-2 hover:ring-offset-1 cursor-pointer`}
    >
      <div className="flex items-center gap-1 min-w-0">
        <Briefcase className="w-3 h-3 shrink-0" />
        {(wo.start_time || wo.estimated_hours != null) && (
          <span className="shrink-0 tabular-nums text-[10px] font-semibold opacity-80" data-testid="wo-chip-time">{formatWorkOrderTime(wo.start_time, wo.estimated_hours)}</span>
        )}
        <span className="font-medium truncate">{wo.title}</span>
      </div>
      {!compact && projectLabel && projectLabel !== wo.title && (
        <div className="truncate text-[11px] opacity-80">{projectLabel}</div>
      )}
      {customerLabel && (
        <div className="truncate text-[11px] opacity-70">{customerLabel}</div>
      )}
      <div className="flex items-center justify-between gap-1 mt-0.5">
        {caseNumber && (
          <span className="font-mono text-[10px] opacity-60">{caseNumber}</span>
        )}
        <span className="text-[10px] uppercase tracking-wide opacity-70">
          {STATUS_LABELS[status]}
        </span>
      </div>
    </button>
  )
}
