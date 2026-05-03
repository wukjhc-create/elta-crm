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

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarCheck, Briefcase, AlertCircle } from 'lucide-react'
import {
  EMPLOYEE_ROLE_OPTIONS,
  type EmployeeRow,
} from '@/types/employees.types'
import type { WorkOrderForCalendar } from '@/lib/actions/work-orders'
import type { WorkOrderStatus } from '@/types/workforce.types'

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
  return dateKey(new Date())
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
}: {
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
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

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

  // Group filtered WOs by date and employee
  const byDateThenEmployee = useMemo(() => {
    const map = new Map<string, Map<string, WorkOrderForCalendar[]>>()
    for (const wo of filteredWOs) {
      if (!wo.scheduled_date) continue
      const dk = wo.scheduled_date.slice(0, 10)
      const empKey = wo.assigned_employee_id ?? '__unassigned__'
      if (!map.has(dk)) map.set(dk, new Map())
      const empMap = map.get(dk)!
      if (!empMap.has(empKey)) empMap.set(empKey, [])
      empMap.get(empKey)!.push(wo)
    }
    return map
  }, [filteredWOs])

  // Detect if any unassigned WOs exist in the visible range
  const hasUnassigned = useMemo(
    () => filteredWOs.some((w) => !w.assigned_employee_id),
    [filteredWOs]
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
            {view === 'week' && (
              <>
                Uge: {fmtShortDate(rangeStart)} – {fmtShortDate(rangeEnd)}
              </>
            )}
          </p>
        </div>

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

      {/* Date nav */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => updateParam({ date: stepBack() })}
          className="p-2 hover:bg-gray-100 rounded-lg"
          title="Forrige"
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
          className="p-2 hover:bg-gray-100 rounded-lg"
          title="Næste"
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

      {loadError && (
        <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Kunne ikke hente arbejdsordrer: {loadError}
        </div>
      )}

      {/* Empty state — no employees */}
      {employeesWithRows.length === 0 && (
        <div className="text-center py-16 bg-white rounded-lg ring-1 ring-gray-200">
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
        </div>
      )}

      {/* Body — Day view */}
      {view === 'day' && employeesWithRows.length > 0 && (
        <DayView
          employees={employeesWithRows}
          date={anchorDate}
          byDateThenEmployee={byDateThenEmployee}
          hasUnassigned={hasUnassigned}
        />
      )}

      {/* Body — Week view */}
      {view === 'week' && employeesWithRows.length > 0 && (
        <WeekView
          employees={employeesWithRows}
          weekDates={weekDates}
          byDateThenEmployee={byDateThenEmployee}
          hasUnassigned={hasUnassigned}
        />
      )}
    </div>
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
}: {
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
          Der er ikke planlagt nogen arbejdsordrer for {fmtDate(date)}. Åbn en
          sag og brug "Planlæg medarbejder" til at tilføje en.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left w-64">Medarbejder</th>
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
  return (
    <tr className="align-top">
      <td className="px-3 py-3 w-64">
        <Link
          href={`/dashboard/employees/${employee.id}`}
          className="font-medium text-gray-900 hover:text-emerald-700 hover:underline"
        >
          {employee.name || '—'}
        </Link>
        <div className="text-xs text-gray-500">{roleLabel}</div>
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
      <td className="px-3 py-3 w-64">
        <span className="font-medium text-amber-900 flex items-center gap-1">
          <AlertCircle className="w-4 h-4" /> Ikke tildelt
        </span>
        <span className="text-xs text-amber-700">Mangler medarbejder</span>
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
}: {
  employees: EmployeeRow[]
  weekDates: string[]
  byDateThenEmployee: Map<string, Map<string, WorkOrderForCalendar[]>>
  hasUnassigned: boolean
}) {
  const today = todayKey()
  return (
    <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-x-auto">
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
  )
}

function WeekEmployeeRow({
  employee,
  weekDates,
  byDateThenEmployee,
}: {
  employee: EmployeeRow
  weekDates: string[]
  byDateThenEmployee: Map<string, Map<string, WorkOrderForCalendar[]>>
}) {
  const today = todayKey()
  const roleLabel = ROLE_LABEL.get(employee.role as any) ?? employee.role
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
      </td>
      {weekDates.map((d) => {
        const isToday = d === today
        const wos = byDateThenEmployee.get(d)?.get(employee.id) ?? []
        return (
          <td
            key={d}
            className={`px-1.5 py-2 border-r last:border-r-0 align-top min-w-[140px] ${
              isToday ? 'bg-emerald-50/40' : ''
            }`}
          >
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
          <AlertCircle className="w-3 h-3" /> Ikke tildelt
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
  const target = wo.case?.case_number
    ? `/dashboard/orders/${wo.case.case_number}`
    : wo.case?.id
    ? `/dashboard/orders/${wo.case.id}`
    : null

  const status = wo.status as WorkOrderStatus
  const colorClass = STATUS_COLORS[status]

  const projectLabel =
    wo.case?.project_name ||
    wo.case?.title ||
    wo.title

  const customerLabel = wo.case?.customer_name ?? null
  const caseNumber = wo.case?.case_number ?? null

  const body = (
    <>
      <div className="flex items-center gap-1 min-w-0">
        <Briefcase className="w-3 h-3 shrink-0" />
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
    </>
  )

  const classes = `block px-2 py-1.5 rounded ring-1 ${colorClass} ${
    compact ? 'text-[11px]' : 'text-xs'
  } w-full max-w-[260px] ${target ? 'hover:ring-2 hover:ring-offset-1 cursor-pointer' : ''}`

  if (target) {
    return (
      <Link href={target} className={classes} title={`${wo.title} → ${caseNumber ?? ''}`}>
        {body}
      </Link>
    )
  }
  return <div className={classes}>{body}</div>
}
