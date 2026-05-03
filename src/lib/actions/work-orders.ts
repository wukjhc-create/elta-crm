'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { createAuditLog } from '@/lib/actions/audit'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'
import type { WorkOrderRow, WorkOrderStatus } from '@/types/workforce.types'

// =====================================================
// Types
// =====================================================

export interface WorkOrderWithEmployee extends WorkOrderRow {
  employee?: { id: string; name: string; email: string | null } | null
}

export interface WorkOrderForCalendar extends WorkOrderRow {
  employee?: { id: string; name: string; email: string | null } | null
  case?: {
    id: string
    case_number: string
    title: string
    project_name: string | null
    customer_name: string | null
  } | null
}

export interface CreateWorkOrderForCaseInput {
  case_id: string
  title: string
  description?: string | null
  scheduled_date?: string | null            // YYYY-MM-DD
  assigned_employee_id?: string | null
  status?: WorkOrderStatus
}

// Status transitions matching the service-layer state machine
// (mirrors src/lib/services/work-orders.ts ALLOWED).
const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  planned:     ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done:        [],
  cancelled:   [],
}

// =====================================================
// Read
// =====================================================

export async function listWorkOrdersForCase(
  caseId: string
): Promise<ActionResult<WorkOrderWithEmployee[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data: rows, error } = await supabase
      .from('work_orders')
      .select(`
        id, case_id, customer_id, title, description, status,
        scheduled_date, assigned_employee_id, source_offer_id,
        auto_invoice_on_done, completed_at, created_at, updated_at
      `)
      .eq('case_id', caseId)
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    if (error) {
      logger.error('listWorkOrdersForCase failed', { error })
      return { success: false, error: 'Kunne ikke hente arbejdsordrer' }
    }

    const workOrders = (rows || []) as WorkOrderRow[]

    // Resolve employees in a separate query (no FK relation hint needed).
    const employeeIds = Array.from(
      new Set(
        workOrders
          .map((w) => w.assigned_employee_id)
          .filter((id): id is string => !!id)
      )
    )

    let employeeMap = new Map<string, { id: string; name: string; email: string | null }>()
    if (employeeIds.length > 0) {
      const { data: emps } = await supabase
        .from('employees')
        .select('id, name, email')
        .in('id', employeeIds)
      employeeMap = new Map(
        (emps || []).map((e: any) => [
          e.id as string,
          {
            id: e.id as string,
            name: (e.name as string) ?? '—',
            email: (e.email as string | null) ?? null,
          },
        ])
      )
    }

    const enriched: WorkOrderWithEmployee[] = workOrders.map((w) => ({
      ...w,
      employee: w.assigned_employee_id ? employeeMap.get(w.assigned_employee_id) ?? null : null,
    }))

    return { success: true, data: enriched }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Create
// =====================================================

export async function createWorkOrderForCase(
  input: CreateWorkOrderForCaseInput
): Promise<ActionResult<WorkOrderRow>> {
  try {
    if (!input.case_id) return { success: false, error: 'Sag mangler' }
    if (!input.title || !input.title.trim()) {
      return { success: false, error: 'Titel er påkrævet' }
    }

    const { supabase } = await getAuthenticatedClient()

    // Pull customer_id from the case so reporting joins work without
    // the caller having to pass it.
    const { data: caseRow, error: caseErr } = await supabase
      .from('service_cases')
      .select('id, customer_id, case_number')
      .eq('id', input.case_id)
      .maybeSingle()
    if (caseErr || !caseRow) {
      return { success: false, error: 'Sag ikke fundet' }
    }

    const { data, error } = await supabase
      .from('work_orders')
      .insert({
        case_id: caseRow.id,
        customer_id: caseRow.customer_id ?? null,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        scheduled_date: input.scheduled_date || null,
        assigned_employee_id: input.assigned_employee_id || null,
        status: input.status || 'planned',
      })
      .select('*')
      .single()

    if (error || !data) {
      logger.error('createWorkOrderForCase failed', { error })
      return { success: false, error: 'Kunne ikke oprette arbejdsordre' }
    }

    // Audit log on the parent service_case
    try {
      await createAuditLog({
        entity_type: 'service_case',
        entity_id: caseRow.id,
        entity_name: (caseRow as any).case_number ?? caseRow.id,
        action: 'update',
        action_description: `Planlagt arbejdsordre oprettet: "${data.title}"${
          data.scheduled_date ? ` (${data.scheduled_date})` : ''
        }`,
      })
    } catch {
      /* best-effort */
    }

    revalidatePath(`/dashboard/orders/${caseRow.id}`)
    if ((caseRow as any).case_number) {
      revalidatePath(`/dashboard/orders/${(caseRow as any).case_number}`)
    }

    return { success: true, data: data as WorkOrderRow }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Update — assignment + schedule
// =====================================================

export async function updateWorkOrderPlanning(
  workOrderId: string,
  input: {
    title?: string
    description?: string | null
    scheduled_date?: string | null
    assigned_employee_id?: string | null
  }
): Promise<ActionResult<WorkOrderRow>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const patch: Record<string, unknown> = {}
    if (input.title !== undefined) patch.title = input.title.trim()
    if (input.description !== undefined)
      patch.description = input.description?.trim() ? input.description.trim() : null
    if (input.scheduled_date !== undefined)
      patch.scheduled_date = input.scheduled_date || null
    if (input.assigned_employee_id !== undefined)
      patch.assigned_employee_id = input.assigned_employee_id || null

    if (Object.keys(patch).length === 0) {
      return { success: false, error: 'Ingen ændringer' }
    }

    // Validate employee (active) if assigning
    if (input.assigned_employee_id) {
      const { data: emp } = await supabase
        .from('employees')
        .select('id, active')
        .eq('id', input.assigned_employee_id)
        .maybeSingle()
      if (!emp) return { success: false, error: 'Medarbejder findes ikke' }
      if (!emp.active) return { success: false, error: 'Medarbejder er inaktiv' }
    }

    const { data, error } = await supabase
      .from('work_orders')
      .update(patch)
      .eq('id', workOrderId)
      .select('*')
      .single()

    if (error || !data) {
      logger.error('updateWorkOrderPlanning failed', { error })
      return { success: false, error: 'Kunne ikke opdatere arbejdsordre' }
    }

    if (data.case_id) {
      revalidatePath(`/dashboard/orders/${data.case_id}`)
    }

    return { success: true, data: data as WorkOrderRow }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Status transition
// =====================================================

export async function changeWorkOrderStatus(
  workOrderId: string,
  next: WorkOrderStatus
): Promise<ActionResult<WorkOrderRow>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Read current
    const { data: cur, error: readErr } = await supabase
      .from('work_orders')
      .select('id, status, case_id')
      .eq('id', workOrderId)
      .maybeSingle()
    if (readErr || !cur) {
      return { success: false, error: 'Arbejdsordre ikke fundet' }
    }

    if (cur.status === next) {
      const { data: row } = await supabase
        .from('work_orders')
        .select('*')
        .eq('id', workOrderId)
        .single()
      return { success: true, data: row as WorkOrderRow }
    }

    if (!ALLOWED_TRANSITIONS[cur.status as WorkOrderStatus]?.includes(next)) {
      return {
        success: false,
        error: `Status kan ikke gå fra ${cur.status} til ${next}`,
      }
    }

    // Block done if a timer is still open
    if (next === 'done') {
      const { count: openTimers } = await supabase
        .from('time_logs')
        .select('id', { count: 'exact', head: true })
        .eq('work_order_id', workOrderId)
        .is('end_time', null)
      if ((openTimers ?? 0) > 0) {
        return {
          success: false,
          error: 'Kan ikke afsluttes — der er en aktiv timer på arbejdsordren',
        }
      }
    }

    const patch: Record<string, unknown> = { status: next }
    if (next === 'done') patch.completed_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('work_orders')
      .update(patch)
      .eq('id', workOrderId)
      .select('*')
      .single()

    if (error || !data) {
      logger.error('changeWorkOrderStatus failed', { error })
      return { success: false, error: 'Kunne ikke ændre status' }
    }

    if (data.case_id) {
      revalidatePath(`/dashboard/orders/${data.case_id}`)
    }

    return { success: true, data: data as WorkOrderRow }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Delete (only allowed while planned and no time_logs)
// =====================================================

export async function deletePlannedWorkOrder(
  workOrderId: string
): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data: wo } = await supabase
      .from('work_orders')
      .select('id, status, case_id')
      .eq('id', workOrderId)
      .maybeSingle()
    if (!wo) return { success: false, error: 'Arbejdsordre ikke fundet' }
    if (wo.status !== 'planned') {
      return {
        success: false,
        error: 'Kun planlagte arbejdsordrer kan slettes — annullér i stedet',
      }
    }

    // Refuse delete if any time logs already exist (FK is RESTRICT anyway)
    const { count } = await supabase
      .from('time_logs')
      .select('id', { count: 'exact', head: true })
      .eq('work_order_id', workOrderId)
    if ((count ?? 0) > 0) {
      return {
        success: false,
        error: 'Arbejdsordre har timeregistreringer og kan ikke slettes',
      }
    }

    const { error } = await supabase.from('work_orders').delete().eq('id', workOrderId)
    if (error) {
      logger.error('deletePlannedWorkOrder failed', { error })
      return { success: false, error: 'Kunne ikke slette arbejdsordre' }
    }

    if (wo.case_id) {
      revalidatePath(`/dashboard/orders/${wo.case_id}`)
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}

// =====================================================
// Calendar — list work_orders by date range (Sprint 4D-1)
// =====================================================

/**
 * Fetch all work_orders with scheduled_date in [start, end] inclusive,
 * enriched with employee and parent service_case info for chip display.
 *
 * Used by /dashboard/calendar (day + week views).
 *
 * Uses idx_work_orders_scheduled (mig 00086) — efficient even for
 * month-spanning ranges.
 */
export async function listWorkOrdersByDateRange(
  startDate: string,    // YYYY-MM-DD inclusive
  endDate: string       // YYYY-MM-DD inclusive
): Promise<ActionResult<WorkOrderForCalendar[]>> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return { success: false, error: 'Datoer skal være i formatet YYYY-MM-DD' }
    }
    const { supabase } = await getAuthenticatedClient()

    const { data: rows, error } = await supabase
      .from('work_orders')
      .select(`
        id, case_id, customer_id, title, description, status,
        scheduled_date, assigned_employee_id, source_offer_id,
        auto_invoice_on_done, low_profit, completed_at, created_at, updated_at
      `)
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      logger.error('listWorkOrdersByDateRange failed', { error })
      return { success: false, error: 'Kunne ikke hente arbejdsordrer' }
    }

    const wos = (rows || []) as WorkOrderRow[]
    if (wos.length === 0) return { success: true, data: [] }

    // Resolve employees + cases in parallel.
    const empIds = Array.from(
      new Set(wos.map((w) => w.assigned_employee_id).filter((id): id is string => !!id))
    )
    const caseIds = Array.from(
      new Set(wos.map((w) => w.case_id).filter((id): id is string => !!id))
    )

    const [empRes, caseRes] = await Promise.all([
      empIds.length === 0
        ? Promise.resolve({ data: [] as any[] })
        : supabase.from('employees').select('id, name, email').in('id', empIds),
      caseIds.length === 0
        ? Promise.resolve({ data: [] as any[] })
        : supabase
            .from('service_cases')
            .select(`
              id, case_number, title, project_name,
              customer:customers!left(id, company_name)
            `)
            .in('id', caseIds),
    ])

    const empMap = new Map(
      (empRes.data || []).map((e: any) => [
        e.id as string,
        {
          id: e.id as string,
          name: (e.name as string) ?? '—',
          email: (e.email as string | null) ?? null,
        },
      ])
    )

    const caseMap = new Map(
      (caseRes.data || []).map((c: any) => [
        c.id as string,
        {
          id: c.id as string,
          case_number: (c.case_number as string) ?? c.id,
          title: (c.title as string) ?? '',
          project_name: (c.project_name as string | null) ?? null,
          customer_name: (c.customer?.company_name as string | null) ?? null,
        },
      ])
    )

    const enriched: WorkOrderForCalendar[] = wos.map((w) => ({
      ...w,
      employee: w.assigned_employee_id ? empMap.get(w.assigned_employee_id) ?? null : null,
      case: w.case_id ? caseMap.get(w.case_id) ?? null : null,
    }))

    return { success: true, data: enriched }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}
