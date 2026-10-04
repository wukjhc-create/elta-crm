'use server'

/**
 * N48: sager der mangler planlægning — aktive sager uden arbejdsordre, eller med planlagte arbejdsordrer uden dato
 * eller uden montør. Grundlag for "Mangler planlægning" i kalenderen. work_orders.plan (admin, serviceleder).
 */

import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
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
