/**
 * Time tracking (Phase 7).
 *
 * Public API mirrors the spec naming (startTimeEntry / stopTimeEntry /
 * createManualTimeEntry) but persists into the `time_logs` table — the
 * legacy `time_entries` table is left intact for the projects module.
 *
 * Safety:
 *   - One active timer per employee enforced by partial UNIQUE index
 *     `uq_time_logs_one_active_per_employee` (raises 23505 on race).
 *   - Manual entries cannot overlap an existing entry for the same
 *     employee (checked in JS; concurrent writes are rare for manual
 *     entries and the index above still blocks "active" overlaps).
 *   - work_order_id FK validates existence; service double-checks status
 *     so we don't accept time for cancelled orders.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import type {
  EmployeeStats,
  TimeLogRow,
} from '@/types/workforce.types'

// =====================================================
// Start
// =====================================================

export async function startTimeEntry(
  employeeId: string,
  workOrderId: string,
  description?: string | null
): Promise<TimeLogRow> {
  const supabase = createAdminClient()

  const [{ data: emp }, { data: wo }] = await Promise.all([
    supabase.from('employees').select('id, active').eq('id', employeeId).maybeSingle(),
    supabase.from('work_orders').select('id, status').eq('id', workOrderId).maybeSingle(),
  ])
  if (!emp) throw new Error(`startTimeEntry: employee ${employeeId} not found`)
  if (!emp.active) throw new Error(`startTimeEntry: employee ${employeeId} is inactive`)
  if (!wo) throw new Error(`startTimeEntry: work_order ${workOrderId} not found`)
  if (wo.status === 'done' || wo.status === 'cancelled') {
    throw new Error(`startTimeEntry: cannot start timer on ${wo.status} work order`)
  }

  const { data, error } = await supabase
    .from('time_logs')
    .insert({
      employee_id: employeeId,
      work_order_id: workOrderId,
      start_time: new Date().toISOString(),
      description: description ?? null,
      billable: true,
    })
    .select('*')
    .single()

  if (error || !data) {
    if ((error as { code?: string })?.code === '23505') {
      throw new Error('startTimeEntry: employee already has an active timer running')
    }
    logger.error('startTimeEntry insert failed', { entityId: employeeId, error })
    throw new Error(`startTimeEntry failed: ${error?.message ?? 'unknown'}`)
  }

  // Auto-bump work order from planned → in_progress when work begins.
  if (wo.status === 'planned') {
    await supabase
      .from('work_orders')
      .update({ status: 'in_progress' })
      .eq('id', workOrderId)
      .eq('status', 'planned')
  }

  console.log('TIME START:', employeeId, workOrderId)
  return data as TimeLogRow
}

// =====================================================
// Stop
// =====================================================

export async function stopTimeEntry(entryId: string): Promise<TimeLogRow> {
  const supabase = createAdminClient()

  // Race-safe: only stop if still running.
  const { data, error } = await supabase
    .from('time_logs')
    .update({ end_time: new Date().toISOString() })
    .eq('id', entryId)
    .is('end_time', null)
    .select('*')
    .single()

  if (error || !data) {
    // Either gone or already stopped — fetch current state for caller.
    const { data: existing } = await supabase
      .from('time_logs')
      .select('*')
      .eq('id', entryId)
      .maybeSingle()
    if (!existing) throw new Error(`stopTimeEntry: entry ${entryId} not found`)
    if (existing.end_time) {
      console.log('TIME STOP (already stopped):', entryId, existing.hours)
      return existing as TimeLogRow
    }
    throw new Error(`stopTimeEntry update failed: ${error?.message ?? 'unknown'}`)
  }

  console.log('TIME STOP:', entryId, data.hours)
  return data as TimeLogRow
}

// =====================================================
// Manual entry
// =====================================================

export interface ManualEntryInput {
  employeeId: string
  workOrderId: string
  startTime: string                      // ISO
  endTime: string                        // ISO — must be > startTime
  description?: string | null
  billable?: boolean
}

export async function createManualTimeEntry(input: ManualEntryInput): Promise<TimeLogRow> {
  const supabase = createAdminClient()
  const start = new Date(input.startTime)
  const end = new Date(input.endTime)
  if (!(start.getTime() < end.getTime())) {
    throw new Error('createManualTimeEntry: endTime must be after startTime')
  }

  const [{ data: emp }, { data: wo }] = await Promise.all([
    supabase.from('employees').select('id, active').eq('id', input.employeeId).maybeSingle(),
    supabase.from('work_orders').select('id, status').eq('id', input.workOrderId).maybeSingle(),
  ])
  if (!emp) throw new Error(`createManualTimeEntry: employee ${input.employeeId} not found`)
  if (!emp.active) throw new Error('createManualTimeEntry: employee is inactive')
  if (!wo) throw new Error(`createManualTimeEntry: work_order ${input.workOrderId} not found`)

  // Overlap check against existing entries for the same employee.
  const { data: overlap } = await supabase
    .from('time_logs')
    .select('id, start_time, end_time')
    .eq('employee_id', input.employeeId)
    .lt('start_time', end.toISOString())
    .or(`end_time.is.null,end_time.gt.${start.toISOString()}`)
    .limit(1)
  if (overlap && overlap.length > 0) {
    throw new Error('createManualTimeEntry: overlaps an existing time entry for this employee')
  }

  const { data, error } = await supabase
    .from('time_logs')
    .insert({
      employee_id: input.employeeId,
      work_order_id: input.workOrderId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      description: input.description ?? null,
      billable: input.billable ?? true,
    })
    .select('*')
    .single()

  if (error || !data) {
    logger.error('createManualTimeEntry insert failed', { entityId: input.employeeId, error })
    throw new Error(`createManualTimeEntry failed: ${error?.message ?? 'unknown'}`)
  }

  console.log('TIME MANUAL:', input.employeeId, input.workOrderId, data.hours)
  return data as TimeLogRow
}

// =====================================================
// Reads
// =====================================================

export async function getActiveTimerForEmployee(employeeId: string): Promise<TimeLogRow | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('time_logs')
    .select('*')
    .eq('employee_id', employeeId)
    .is('end_time', null)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as TimeLogRow | null) ?? null
}

export async function getEmployeeStats(employeeId: string): Promise<EmployeeStats> {
  const supabase = createAdminClient()

  const now = new Date()
  const todayIso = now.toISOString().slice(0, 10)
  const dow = now.getDay()                                  // 0 = Sun, 1 = Mon …
  const offsetToMonday = ((dow + 6) % 7)                    // Mon = 0
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - offsetToMonday)

  const [activeTaskCount, todayLogs, weekLogs, activeTimer] = await Promise.all([
    supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_employee_id', employeeId)
      .in('status', ['planned', 'in_progress'])
      .then((r) => r.count ?? 0),
    supabase
      .from('time_logs')
      .select('hours')
      .eq('employee_id', employeeId)
      .gte('start_time', `${todayIso}T00:00:00.000Z`)
      .not('hours', 'is', null)
      .then((r) => sumHours(r.data)),
    supabase
      .from('time_logs')
      .select('hours')
      .eq('employee_id', employeeId)
      .gte('start_time', monday.toISOString())
      .not('hours', 'is', null)
      .then((r) => sumHours(r.data)),
    getActiveTimerForEmployee(employeeId),
  ])

  return {
    employeeId,
    activeTaskCount,
    hoursToday: todayLogs,
    hoursThisWeek: weekLogs,
    activeTimer,
  }
}

function sumHours(rows: Array<{ hours: number | string | null }> | null): number {
  if (!rows) return 0
  let total = 0
  for (const r of rows) total += Number(r.hours) || 0
  return Number(total.toFixed(2))
}
