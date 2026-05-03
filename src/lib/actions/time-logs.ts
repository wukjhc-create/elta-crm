'use server'

/**
 * Sprint 4C — time_logs server actions for the order detail UI.
 *
 * Decisions:
 *  - Manual timesheet entry only (start_time + end_time on a date),
 *    not a real-time clock-in/clock-out. Matches operator workflow:
 *    medarbejder registrerer timer for en dag, ikke live timer.
 *  - No delete action: time_logs has `invoice_line_id` to prevent
 *    double-billing (mig 00086) — once invoiced, the row is locked.
 *    Allowing delete from UI would require an unfaktureret-only
 *    guard, which adds complexity. Operators can edit the hours
 *    via updateTimeLog instead.
 *  - createTimeLog stores billable=true by default; updateTimeLog
 *    refuses if invoice_line_id is set (prevents tampering with
 *    invoiced rows).
 *  - cost_amount is computed by trg_time_logs_cost_amount BEFORE
 *    INSERT/UPDATE — we never set it manually.
 *  - All RLS gated: work_orders_all_auth + time_logs_all_auth allow
 *    authenticated users to INSERT/SELECT.
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'
import type { TimeLogRow } from '@/types/workforce.types'

export interface TimeLogWithEmployee extends TimeLogRow {
  employee?: { id: string; name: string; email: string | null } | null
}

export interface TimeLogsForCase {
  byWorkOrder: Map<string, TimeLogWithEmployee[]>
  totalHours: number
  totalCostAmount: number
  count: number
}

// ===== Reads =====

export async function listTimeLogsForWorkOrder(
  workOrderId: string
): Promise<ActionResult<TimeLogWithEmployee[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('time_logs')
      .select(`
        id, employee_id, work_order_id, start_time, end_time, hours,
        cost_amount, description, billable, invoice_line_id, created_at
      `)
      .eq('work_order_id', workOrderId)
      .order('start_time', { ascending: false })

    if (error) {
      logger.error('listTimeLogsForWorkOrder failed', { error })
      return { success: false, error: 'Kunne ikke hente timeregistreringer' }
    }

    const rows = (data || []) as TimeLogRow[]
    const enriched = await enrichWithEmployees(supabase, rows)
    return { success: true, data: enriched }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

export async function listTimeLogsForCase(
  caseId: string
): Promise<ActionResult<TimeLogWithEmployee[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Pull all work_orders for the case so we can scope the time_logs query.
    const { data: woRows, error: woErr } = await supabase
      .from('work_orders')
      .select('id')
      .eq('case_id', caseId)
    if (woErr) {
      logger.error('listTimeLogsForCase: failed to fetch work_orders', { error: woErr })
      return { success: false, error: 'Kunne ikke hente arbejdsordrer for sagen' }
    }
    const woIds = (woRows || []).map((r) => r.id as string)
    if (woIds.length === 0) return { success: true, data: [] }

    const { data, error } = await supabase
      .from('time_logs')
      .select(`
        id, employee_id, work_order_id, start_time, end_time, hours,
        cost_amount, description, billable, invoice_line_id, created_at
      `)
      .in('work_order_id', woIds)
      .order('start_time', { ascending: false })

    if (error) {
      logger.error('listTimeLogsForCase failed', { error })
      return { success: false, error: 'Kunne ikke hente timeregistreringer' }
    }

    const rows = (data || []) as TimeLogRow[]
    const enriched = await enrichWithEmployees(supabase, rows)
    return { success: true, data: enriched }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// ===== Write — create =====

export interface CreateTimeLogInput {
  work_order_id: string
  employee_id: string
  /** Date in YYYY-MM-DD format. Combined with start_clock for start_time. */
  date: string
  /** Clock time HH:mm — used as start_time. Defaults to 08:00 if blank. */
  start_clock?: string | null
  /** Either provide hours OR end_clock (not both). */
  hours?: number | null
  /** Clock time HH:mm — used as end_time. */
  end_clock?: string | null
  description?: string | null
  billable?: boolean
}

export async function createTimeLog(
  input: CreateTimeLogInput
): Promise<ActionResult<TimeLogRow>> {
  try {
    if (!input.work_order_id) return { success: false, error: 'Arbejdsordre mangler' }
    if (!input.employee_id) return { success: false, error: 'Medarbejder mangler' }
    if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { success: false, error: 'Dato skal være i formatet YYYY-MM-DD' }
    }

    const { supabase } = await getAuthenticatedClient()

    // Validate work_order exists and grab case_id for revalidate.
    const { data: wo, error: woErr } = await supabase
      .from('work_orders')
      .select('id, case_id, status')
      .eq('id', input.work_order_id)
      .maybeSingle()
    if (woErr || !wo) {
      return { success: false, error: 'Arbejdsordre ikke fundet' }
    }
    if (wo.status === 'cancelled') {
      return { success: false, error: 'Kan ikke registrere timer på en annulleret arbejdsordre' }
    }

    // Validate employee exists + active.
    const { data: emp } = await supabase
      .from('employees')
      .select('id, active')
      .eq('id', input.employee_id)
      .maybeSingle()
    if (!emp) return { success: false, error: 'Medarbejder ikke fundet' }
    if (!emp.active) return { success: false, error: 'Medarbejder er inaktiv' }

    // Compute start_time / end_time.
    const startClock = (input.start_clock?.trim() || '08:00').padEnd(5, '0')
    if (!/^\d{2}:\d{2}$/.test(startClock)) {
      return { success: false, error: 'Starttid skal være i formatet HH:mm' }
    }
    const startTimeIso = new Date(`${input.date}T${startClock}:00+02:00`).toISOString()

    let endTimeIso: string | null = null
    if (input.end_clock && input.end_clock.trim().length > 0) {
      const endClock = input.end_clock.trim()
      if (!/^\d{2}:\d{2}$/.test(endClock)) {
        return { success: false, error: 'Sluttid skal være i formatet HH:mm' }
      }
      endTimeIso = new Date(`${input.date}T${endClock}:00+02:00`).toISOString()
      if (new Date(endTimeIso).getTime() <= new Date(startTimeIso).getTime()) {
        return { success: false, error: 'Sluttid skal være efter starttid' }
      }
    } else if (typeof input.hours === 'number' && Number.isFinite(input.hours) && input.hours > 0) {
      // Compute end_time from start_time + hours.
      const startMs = new Date(startTimeIso).getTime()
      endTimeIso = new Date(startMs + input.hours * 3600_000).toISOString()
    } else {
      return {
        success: false,
        error: 'Angiv enten antal timer eller sluttid',
      }
    }

    // The DB has a partial UNIQUE preventing two open timers per employee.
    // We always insert with end_time set (manual timesheet flow), so this
    // doesn't apply — but be defensive in case of future real-time usage.

    const { data, error } = await supabase
      .from('time_logs')
      .insert({
        work_order_id: input.work_order_id,
        employee_id: input.employee_id,
        start_time: startTimeIso,
        end_time: endTimeIso,
        description: input.description?.trim() || null,
        billable: input.billable !== false,
      })
      .select('*')
      .single()

    if (error || !data) {
      logger.error('createTimeLog failed', { error })
      return { success: false, error: 'Kunne ikke gemme timeregistrering' }
    }

    if (wo.case_id) {
      revalidatePath(`/dashboard/orders/${wo.case_id}`)
    }
    return { success: true, data: data as TimeLogRow }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// ===== Write — update =====

export interface UpdateTimeLogInput {
  date?: string
  start_clock?: string | null
  end_clock?: string | null
  hours?: number | null
  description?: string | null
  billable?: boolean
}

export async function updateTimeLog(
  timeLogId: string,
  input: UpdateTimeLogInput
): Promise<ActionResult<TimeLogRow>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Read current row + check invoice lock.
    const { data: cur, error: readErr } = await supabase
      .from('time_logs')
      .select('id, work_order_id, employee_id, start_time, end_time, invoice_line_id')
      .eq('id', timeLogId)
      .maybeSingle()
    if (readErr || !cur) return { success: false, error: 'Timeregistrering ikke fundet' }

    if (cur.invoice_line_id) {
      return {
        success: false,
        error: 'Kan ikke ændre — timeregistreringen er allerede faktureret',
      }
    }

    // Compose new start/end if any time-fields were touched.
    const patch: Record<string, unknown> = {}

    if (
      input.date !== undefined ||
      input.start_clock !== undefined ||
      input.end_clock !== undefined ||
      input.hours !== undefined
    ) {
      const curStart = new Date(cur.start_time as string)
      const dateStr =
        input.date ??
        `${curStart.getFullYear()}-${String(curStart.getMonth() + 1).padStart(2, '0')}-${String(
          curStart.getDate()
        ).padStart(2, '0')}`
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return { success: false, error: 'Dato skal være YYYY-MM-DD' }
      }

      const startClock =
        input.start_clock ??
        `${String(curStart.getHours()).padStart(2, '0')}:${String(curStart.getMinutes()).padStart(2, '0')}`
      if (!/^\d{2}:\d{2}$/.test(startClock)) {
        return { success: false, error: 'Starttid skal være HH:mm' }
      }
      const startTimeIso = new Date(`${dateStr}T${startClock}:00+02:00`).toISOString()
      patch.start_time = startTimeIso

      let endTimeIso: string | null = null
      if (input.end_clock !== undefined) {
        if (input.end_clock && /^\d{2}:\d{2}$/.test(input.end_clock)) {
          endTimeIso = new Date(`${dateStr}T${input.end_clock}:00+02:00`).toISOString()
        } else {
          return { success: false, error: 'Sluttid skal være HH:mm' }
        }
      } else if (typeof input.hours === 'number' && Number.isFinite(input.hours) && input.hours > 0) {
        endTimeIso = new Date(new Date(startTimeIso).getTime() + input.hours * 3600_000).toISOString()
      } else if (cur.end_time) {
        // keep existing end_time
        endTimeIso = cur.end_time as string
      }

      if (endTimeIso) {
        if (new Date(endTimeIso).getTime() <= new Date(startTimeIso).getTime()) {
          return { success: false, error: 'Sluttid skal være efter starttid' }
        }
        patch.end_time = endTimeIso
      }
    }

    if (input.description !== undefined) {
      patch.description = input.description?.trim() || null
    }
    if (input.billable !== undefined) {
      patch.billable = !!input.billable
    }

    if (Object.keys(patch).length === 0) {
      return { success: false, error: 'Ingen ændringer' }
    }

    const { data, error } = await supabase
      .from('time_logs')
      .update(patch)
      .eq('id', timeLogId)
      .select('*')
      .single()

    if (error || !data) {
      logger.error('updateTimeLog failed', { error })
      return { success: false, error: 'Kunne ikke opdatere timeregistrering' }
    }

    // Resolve case_id for revalidate.
    const { data: wo } = await supabase
      .from('work_orders')
      .select('case_id')
      .eq('id', cur.work_order_id as string)
      .maybeSingle()
    if (wo?.case_id) {
      revalidatePath(`/dashboard/orders/${wo.case_id}`)
    }

    return { success: true, data: data as TimeLogRow }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// ===== Helpers =====

async function enrichWithEmployees(
  supabase: Awaited<ReturnType<typeof getAuthenticatedClient>>['supabase'],
  rows: TimeLogRow[]
): Promise<TimeLogWithEmployee[]> {
  const empIds = Array.from(new Set(rows.map((r) => r.employee_id).filter(Boolean)))
  if (empIds.length === 0) return rows.map((r) => ({ ...r, employee: null }))

  const { data: emps } = await supabase
    .from('employees')
    .select('id, name, email')
    .in('id', empIds)

  const empMap = new Map(
    (emps || []).map((e: any) => [
      e.id as string,
      {
        id: e.id as string,
        name: (e.name as string) ?? '—',
        email: (e.email as string | null) ?? null,
      },
    ])
  )

  return rows.map((r) => ({
    ...r,
    employee: empMap.get(r.employee_id) ?? null,
  }))
}
