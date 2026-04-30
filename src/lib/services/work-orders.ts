/**
 * Work orders (Phase 7).
 *
 * Lifecycle: planned → in_progress → done. `cancelled` is a terminal
 * sink that we allow from any non-done state.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import type { WorkOrderRow, WorkOrderStatus } from '@/types/workforce.types'

const ALLOWED: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  planned:     ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done:        [],
  cancelled:   [],
}

export interface CreateFromCaseInput {
  caseId: string
  title?: string
  description?: string | null
  scheduledDate?: string | null
  assignedEmployeeId?: string | null
}

/**
 * Create a work_order seeded from a service_case. Pulls customer_id,
 * title and (optionally) description from the case so callers don't
 * have to repeat themselves.
 */
export async function createWorkOrderFromCase(input: CreateFromCaseInput): Promise<WorkOrderRow> {
  const supabase = createAdminClient()

  const { data: caseRow, error: caseErr } = await supabase
    .from('service_cases')
    .select('id, customer_id, title, description')
    .eq('id', input.caseId)
    .maybeSingle()
  if (caseErr || !caseRow) {
    throw new Error(`createWorkOrderFromCase: case ${input.caseId} not found`)
  }

  const { data, error } = await supabase
    .from('work_orders')
    .insert({
      case_id: caseRow.id,
      customer_id: caseRow.customer_id,
      title: input.title || caseRow.title || 'Arbejdsordre',
      description: input.description ?? caseRow.description ?? null,
      status: 'planned',
      scheduled_date: input.scheduledDate ?? null,
      assigned_employee_id: input.assignedEmployeeId ?? null,
    })
    .select('*')
    .single()

  if (error || !data) {
    logger.error('createWorkOrderFromCase failed', { entityId: input.caseId, error })
    throw new Error(`createWorkOrderFromCase failed: ${error?.message ?? 'unknown'}`)
  }
  console.log('WORK ORDER CREATED:', data.id, 'from case', input.caseId)
  return data as WorkOrderRow
}

export async function assignWorkOrder(
  workOrderId: string,
  employeeId: string | null,
  scheduledDate?: string | null
): Promise<WorkOrderRow> {
  const supabase = createAdminClient()

  if (employeeId) {
    const { data: emp } = await supabase
      .from('employees')
      .select('id, active')
      .eq('id', employeeId)
      .maybeSingle()
    if (!emp) throw new Error(`assignWorkOrder: employee ${employeeId} not found`)
    if (!emp.active) throw new Error(`assignWorkOrder: employee ${employeeId} is inactive`)
  }

  const patch: Partial<WorkOrderRow> = { assigned_employee_id: employeeId }
  if (scheduledDate !== undefined) patch.scheduled_date = scheduledDate

  const { data, error } = await supabase
    .from('work_orders')
    .update(patch)
    .eq('id', workOrderId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`assignWorkOrder failed: ${error?.message ?? 'unknown'}`)
  console.log('WORK ORDER ASSIGNED:', workOrderId, '→', employeeId ?? '(unassigned)')
  return data as WorkOrderRow
}

export async function setWorkOrderStatus(
  workOrderId: string,
  next: WorkOrderStatus
): Promise<WorkOrderRow> {
  const supabase = createAdminClient()

  const { data: cur, error: readErr } = await supabase
    .from('work_orders')
    .select('id, status')
    .eq('id', workOrderId)
    .maybeSingle()
  if (readErr || !cur) throw new Error(`setWorkOrderStatus: work order ${workOrderId} not found`)

  if (cur.status === next) {
    const { data: row } = await supabase.from('work_orders').select('*').eq('id', workOrderId).single()
    return row as WorkOrderRow
  }
  if (!ALLOWED[cur.status as WorkOrderStatus]?.includes(next)) {
    throw new Error(`setWorkOrderStatus: cannot transition ${cur.status} → ${next}`)
  }

  // Block transition to 'done' if there's still an open timer on this WO.
  if (next === 'done') {
    const { count: open } = await supabase
      .from('time_logs')
      .select('id', { count: 'exact', head: true })
      .eq('work_order_id', workOrderId)
      .is('end_time', null)
    if ((open ?? 0) > 0) {
      throw new Error('setWorkOrderStatus: cannot mark done while a timer is still running on this work order')
    }
  }

  const patch: Partial<WorkOrderRow> = { status: next }
  if (next === 'done') patch.completed_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('work_orders')
    .update(patch)
    .eq('id', workOrderId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`setWorkOrderStatus update failed: ${error?.message ?? 'unknown'}`)

  console.log('WORK ORDER STATUS:', workOrderId, cur.status, '→', next)

  // Phase 10 — autopilot. Default rule "work_order_done →
  // create_invoice_from_work_order" gated on auto_invoice_on_done.
  // Best-effort; never blocks the status flip.
  if (next === 'done') {
    try {
      const wo = data as WorkOrderRow & { auto_invoice_on_done?: boolean }
      const { evaluateAndRunAutomations } = await import('@/lib/automation/rule-engine')
      await evaluateAndRunAutomations({
        trigger: 'work_order_done',
        entityType: 'work_order',
        entityId: workOrderId,
        payload: {
          work_order_id: workOrderId,
          customer_id: wo.customer_id,
          auto_invoice_on_done: wo.auto_invoice_on_done ?? false,
        },
      })
    } catch (err) {
      logger.error('Autopilot work_order_done failed (non-critical)', {
        entityId: workOrderId,
        error: err instanceof Error ? err : new Error(String(err)),
      })
    }
  }

  return data as WorkOrderRow
}

/**
 * Pull all billable, completed, un-billed time logs for a work order
 * and roll them up into invoice-line ready suggestions (one line per
 * employee — keeps invoices readable). Caller sets unit_price.
 */
export async function getWorkOrderBillableLines(workOrderId: string): Promise<{
  lines: Array<{
    description: string
    quantity: number
    unit: string
    unit_price: number
    source_time_log_ids: string[]
  }>
  totalHours: number
}> {
  const supabase = createAdminClient()

  const { data: wo } = await supabase
    .from('work_orders')
    .select('id, title, status')
    .eq('id', workOrderId)
    .maybeSingle()
  if (!wo) throw new Error(`getWorkOrderBillableLines: work order ${workOrderId} not found`)

  const { data: logs } = await supabase
    .from('time_logs')
    .select('id, employee_id, hours, description')
    .eq('work_order_id', workOrderId)
    .eq('billable', true)
    .is('invoice_line_id', null)
    .not('end_time', 'is', null)
    .gt('hours', 0)

  if (!logs || logs.length === 0) return { lines: [], totalHours: 0 }

  const empIds = Array.from(new Set(logs.map((l) => l.employee_id)))
  const { data: emps } = await supabase
    .from('employees')
    .select('id, name, role')
    .in('id', empIds)
  const empMap = new Map((emps ?? []).map((e) => [e.id, e]))

  const grouped = new Map<string, { hours: number; ids: string[] }>()
  for (const l of logs) {
    const key = l.employee_id
    const slot = grouped.get(key) ?? { hours: 0, ids: [] }
    slot.hours += Number(l.hours) || 0
    slot.ids.push(l.id)
    grouped.set(key, slot)
  }

  let totalHours = 0
  const lines = Array.from(grouped.entries()).map(([empId, slot]) => {
    totalHours += slot.hours
    const emp = empMap.get(empId)
    const label = emp ? `${wo.title} – ${emp.name}` : `${wo.title} – timer`
    return {
      description: label,
      quantity: Number(slot.hours.toFixed(2)),
      unit: 'time',
      unit_price: 0,                       // policy decision — caller fills in
      source_time_log_ids: slot.ids,
    }
  })

  return { lines, totalHours: Number(totalHours.toFixed(2)) }
}
