'use server'

/**
 * N48: sager der mangler planlægning — aktive sager uden arbejdsordre, eller med planlagte arbejdsordrer uden dato
 * eller uden montør. Grundlag for "Mangler planlægning" i kalenderen. work_orders.plan (admin, serviceleder).
 */

import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
import { calendarDaysSince, copenhagenParts } from '@/lib/utils/copenhagen-time'
import type { ActionResult } from '@/types/common.types'

export interface PlanningBacklogItem {
  case_id: string
  case_number: string | null
  title: string
  customer_name: string | null
  status: string
  reason: 'no_work_order' | 'missing_date' | 'missing_employee'
  work_order_count: number
  created_at: string
}

const ACTIVE_STATUSES = ['new', 'in_progress', 'pending']

export async function getPlanningBacklogAction(): Promise<ActionResult<{ items: PlanningBacklogItem[]; total: number }>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('work_orders.plan')) return { success: false, error: 'Manglende tilladelse: work_orders.plan' }

    const { data: cases, error } = await supabase
      .from('service_cases')
      .select('id, case_number, title, status, created_at, customer:customers!service_cases_customer_id_fkey(company_name)')
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true })
      .limit(300)
    if (error) {
      logger.error('getPlanningBacklogAction: cases failed', { error })
      return { success: false, error: 'Kunne ikke hente sager' }
    }
    const list = (cases ?? []) as Array<{ id: string; case_number: string | null; title: string; status: string; created_at: string;
      customer: { company_name?: string | null } | Array<{ company_name?: string | null }> | null }>
    if (!list.length) return { success: true, data: { items: [], total: 0 } }

    const { data: wos, error: woErr } = await supabase
      .from('work_orders')
      .select('case_id, status, scheduled_date, assigned_employee_id')
      .in('case_id', list.map((c) => c.id))
    if (woErr) {
      logger.error('getPlanningBacklogAction: work_orders failed', { error: woErr })
      return { success: false, error: 'Kunne ikke hente arbejdsordrer' }
    }
    const byCase = new Map<string, Array<{ status: string; scheduled_date: string | null; assigned_employee_id: string | null }>>()
    for (const w of (wos ?? []) as Array<{ case_id: string; status: string; scheduled_date: string | null; assigned_employee_id: string | null }>) {
      byCase.set(w.case_id, [...(byCase.get(w.case_id) ?? []), w])
    }

    const items: PlanningBacklogItem[] = []
    for (const c of list) {
      const w = byCase.get(c.id) ?? []
      const open = w.filter((x) => x.status === 'planned')
      let reason: PlanningBacklogItem['reason'] | null = null
      if (w.filter((x) => x.status !== 'cancelled').length === 0) reason = 'no_work_order'
      else if (open.some((x) => !x.scheduled_date)) reason = 'missing_date'
      else if (open.some((x) => !x.assigned_employee_id)) reason = 'missing_employee'
      if (!reason) continue
      const cust = Array.isArray(c.customer) ? c.customer[0] : c.customer
      items.push({ case_id: c.id, case_number: c.case_number, title: c.title, customer_name: cust?.company_name ?? null, status: c.status,
        reason, work_order_count: w.length, created_at: c.created_at })
    }
    return { success: true, data: { items: items.slice(0, 20), total: items.length } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente planlægningsbehov') }
  }
}

export interface JobWithoutTimeItem {
  work_order_id: string
  case_id: string | null
  case_number: string | null
  title: string
  employee_name: string | null
  scheduled_date: string
  status: string
  days_ago: number
}

/**
 * N62: job der er overstået uden registreret tid — arbejdsordrer med montør og dato før i dag (dansk kalenderdag,
 * seneste 60 dage), ikke annulleret, uden én eneste timelinje. Timer der aldrig registreres bliver aldrig faktureret.
 * work_orders.plan; kun læsning.
 */
export async function getJobsWithoutTimeAction(): Promise<ActionResult<{ items: JobWithoutTimeItem[]; total: number }>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('work_orders.plan')) return { success: false, error: 'Manglende tilladelse: work_orders.plan' }

    const today = copenhagenParts(new Date()).date
    const from = copenhagenParts(new Date(Date.now() - 60 * 86_400_000)).date
    const { data: wos, error } = await supabase
      .from('work_orders')
      .select('id, case_id, title, status, scheduled_date, assigned_employee_id')
      .neq('status', 'cancelled')
      .not('assigned_employee_id', 'is', null)
      .lt('scheduled_date', today)
      .gte('scheduled_date', from)
      .order('scheduled_date', { ascending: true })
      .limit(500)
    if (error) {
      logger.error('getJobsWithoutTimeAction: work_orders failed', { error })
      return { success: false, error: 'Kunne ikke hente arbejdsordrer' }
    }
    const list = (wos ?? []) as Array<{ id: string; case_id: string | null; title: string; status: string; scheduled_date: string; assigned_employee_id: string }>
    if (!list.length) return { success: true, data: { items: [], total: 0 } }

    const { data: logs, error: logErr } = await supabase.from('time_logs').select('work_order_id').in('work_order_id', list.map((w) => w.id))
    if (logErr) {
      logger.error('getJobsWithoutTimeAction: time_logs failed', { error: logErr })
      return { success: false, error: 'Kunne ikke hente tidsregistreringer' }
    }
    const withTime = new Set(((logs ?? []) as Array<{ work_order_id: string }>).map((l) => l.work_order_id))
    const missing = list.filter((w) => !withTime.has(w.id))
    if (!missing.length) return { success: true, data: { items: [], total: 0 } }

    const shown = missing.slice(0, 20)
    const caseIds = Array.from(new Set(shown.map((w) => w.case_id).filter((x): x is string => !!x)))
    const empIds = Array.from(new Set(shown.map((w) => w.assigned_employee_id)))
    const [cs, emps] = await Promise.all([
      caseIds.length ? supabase.from('service_cases').select('id, case_number').in('id', caseIds) : Promise.resolve({ data: [] }),
      supabase.from('employees').select('id, name').in('id', empIds),
    ])
    const caseNo = new Map(((cs.data ?? []) as Array<{ id: string; case_number: string | null }>).map((c) => [c.id, c.case_number]))
    const empName = new Map(((emps.data ?? []) as Array<{ id: string; name: string }>).map((e) => [e.id, e.name]))
    return {
      success: true,
      data: {
        total: missing.length,
        items: shown.map((w) => ({
          work_order_id: w.id, case_id: w.case_id, case_number: w.case_id ? caseNo.get(w.case_id) ?? null : null, title: w.title,
          employee_name: empName.get(w.assigned_employee_id) ?? null, scheduled_date: w.scheduled_date, status: w.status,
          days_ago: calendarDaysSince(w.scheduled_date),
        })),
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente job uden tid') }
  }
}
