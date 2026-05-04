'use server'

/**
 * Sprint 5D — getServiceCaseEconomy
 *
 * Aggregates the live economy of a service_case from canonical sources:
 *   - service_cases (contract_sum, revised_sum, budget, planned_hours, low_profit, status)
 *   - time_logs (joined to work_orders by case_id) → labor cost + sale
 *   - case_materials → material cost + sale
 *   - case_other_costs → other cost + sale
 *   - invoices (joined via work_orders) → revenue, only used if rows exist
 *
 * No snapshot table, no RPC, no DB writes. Pure read aggregated in JS.
 * No fake invoice numbers — invoicing.has_invoice_data is false when 0
 * rows so the UI can show a "kommer i Sprint 6" placeholder.
 */

import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
import { validateUUID } from '@/lib/validations/common'
import type { ActionResult } from '@/types/common.types'
import type { ServiceCaseStatus } from '@/types/service-cases.types'

export interface ServiceCaseEconomy {
  case_id: string
  case_status: ServiceCaseStatus

  contract_sum: number | null
  revised_sum: number | null
  budget: number | null
  planned_hours: number | null
  low_profit: boolean

  labor: {
    work_order_count: number
    time_log_count: number
    open_timer_count: number
    total_hours: number
    total_cost: number
    total_sales_price: number
    employees_without_rate_count: number
  }

  materials: {
    line_count: number
    total_cost: number
    total_sales_price: number
    lines_without_cost: number
    lines_without_sale: number
  }

  other_costs: {
    line_count: number
    total_cost: number
    total_sales_price: number
    lines_without_sale: number
  }

  totals: {
    cost: number
    sales_price: number
    contribution_margin: number
    margin_percentage: number
  }

  invoicing: {
    has_invoice_data: boolean
    invoice_count: number
    invoiced_total: number
    invoiced_paid: number
    remaining_to_invoice: number | null
  }

  quality_flags: {
    no_labor: boolean
    no_materials: boolean
    no_other_costs: boolean
    open_timer: boolean
    employees_without_rate: boolean
    materials_without_cost: boolean
    materials_without_sale: boolean
    low_margin: boolean
    no_contract_sum: boolean
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100

export async function getServiceCaseEconomy(
  caseId: string
): Promise<ActionResult<ServiceCaseEconomy>> {
  try {
    validateUUID(caseId, 'case_id')
    const { supabase } = await getAuthenticatedClient()

    // 1. Sag header
    const { data: sag, error: sagErr } = await supabase
      .from('service_cases')
      .select(
        'id, status, contract_sum, revised_sum, budget, planned_hours, low_profit'
      )
      .eq('id', caseId)
      .maybeSingle()
    if (sagErr || !sag) {
      return { success: false, error: 'Sag ikke fundet' }
    }

    // 2. Work orders for the sag (so we can scope time_logs + invoices)
    const { data: wos, error: woErr } = await supabase
      .from('work_orders')
      .select('id')
      .eq('case_id', caseId)
    if (woErr) {
      logger.error('getServiceCaseEconomy: work_orders fetch failed', { error: woErr, entityId: caseId })
      return { success: false, error: 'Kunne ikke læse arbejdsordrer' }
    }
    const woIds = (wos ?? []).map((w) => w.id as string)
    const work_order_count = woIds.length

    // 3. Parallel: time_logs (with employees), case_materials, case_other_costs, invoices
    const [timeLogsRes, materialsRes, otherCostsRes, invoicesRes] = await Promise.all([
      woIds.length === 0
        ? Promise.resolve({ data: [] as Array<{ hours: number | null; end_time: string | null; cost_amount: number | null; employee: { hourly_rate: number | null } | null }> })
        : supabase
            .from('time_logs')
            .select('hours, end_time, cost_amount, employee:employees(hourly_rate)')
            .in('work_order_id', woIds),
      supabase
        .from('case_materials')
        .select('total_cost, total_sales_price, unit_cost, unit_sales_price')
        .eq('case_id', caseId),
      supabase
        .from('case_other_costs')
        .select('total_cost, total_sales_price, unit_sales_price')
        .eq('case_id', caseId),
      woIds.length === 0
        ? Promise.resolve({ data: [] as Array<{ total_amount: number | null; amount_paid: number | null }> })
        : supabase
            .from('invoices')
            .select('total_amount, amount_paid')
            .in('work_order_id', woIds),
    ])

    // ---- Labor rollup ----
    const timeRows = (timeLogsRes.data ?? []) as Array<{
      hours: number | string | null
      end_time: string | null
      cost_amount: number | string | null
      employee: { hourly_rate: number | string | null } | Array<{ hourly_rate: number | string | null }> | null
    }>
    let total_hours = 0
    let total_labor_cost = 0
    let total_labor_sale = 0
    let open_timer_count = 0
    let employees_without_rate_count = 0
    for (const tl of timeRows) {
      if (tl.end_time === null) {
        open_timer_count += 1
        continue                                  // open timers don't contribute to cost/sale yet
      }
      const hours = Number(tl.hours ?? 0)
      const cost = Number(tl.cost_amount ?? 0)
      // employee may come back as object or single-element array depending on join shape
      const emp = Array.isArray(tl.employee) ? tl.employee[0] : tl.employee
      const rate = emp?.hourly_rate == null ? null : Number(emp.hourly_rate)
      if (rate == null || rate === 0) {
        employees_without_rate_count += 1
      }
      total_hours += Number.isFinite(hours) ? hours : 0
      total_labor_cost += Number.isFinite(cost) ? cost : 0
      total_labor_sale += Number.isFinite(hours) && rate != null ? hours * rate : 0
    }

    // ---- Materials rollup ----
    const matRows = (materialsRes.data ?? []) as Array<{
      total_cost: number | string | null
      total_sales_price: number | string | null
      unit_cost: number | string | null
      unit_sales_price: number | string | null
    }>
    let mat_cost = 0
    let mat_sale = 0
    let mat_without_cost = 0
    let mat_without_sale = 0
    for (const m of matRows) {
      mat_cost += Number(m.total_cost ?? 0)
      mat_sale += Number(m.total_sales_price ?? 0)
      if (Number(m.unit_cost ?? 0) === 0) mat_without_cost += 1
      if (Number(m.unit_sales_price ?? 0) === 0) mat_without_sale += 1
    }

    // ---- Other costs rollup ----
    const otherRows = (otherCostsRes.data ?? []) as Array<{
      total_cost: number | string | null
      total_sales_price: number | string | null
      unit_sales_price: number | string | null
    }>
    let oth_cost = 0
    let oth_sale = 0
    let oth_without_sale = 0
    for (const o of otherRows) {
      oth_cost += Number(o.total_cost ?? 0)
      oth_sale += Number(o.total_sales_price ?? 0)
      if (Number(o.unit_sales_price ?? 0) === 0) oth_without_sale += 1
    }

    // ---- Invoices rollup ----
    const invRows = (invoicesRes.data ?? []) as Array<{
      total_amount: number | string | null
      amount_paid: number | string | null
    }>
    let invoiced_total = 0
    let invoiced_paid = 0
    for (const i of invRows) {
      invoiced_total += Number(i.total_amount ?? 0)
      invoiced_paid += Number(i.amount_paid ?? 0)
    }
    const has_invoice_data = invRows.length > 0

    // ---- Totals ----
    const total_cost = total_labor_cost + mat_cost + oth_cost
    const total_sale = total_labor_sale + mat_sale + oth_sale
    const cm = total_sale - total_cost
    const margin_pct = total_sale > 0 ? (cm / total_sale) * 100 : 0

    // ---- Remaining to invoice ----
    const referenceSum =
      sag.revised_sum != null
        ? Number(sag.revised_sum)
        : sag.contract_sum != null
        ? Number(sag.contract_sum)
        : null
    const remaining_to_invoice =
      referenceSum != null ? r2(referenceSum - invoiced_total) : null

    // ---- Quality flags ----
    const flags = {
      no_labor: timeRows.length === 0,
      no_materials: matRows.length === 0,
      no_other_costs: otherRows.length === 0,
      open_timer: open_timer_count > 0,
      employees_without_rate: employees_without_rate_count > 0,
      materials_without_cost: mat_without_cost > 0,
      materials_without_sale: mat_without_sale > 0,
      low_margin: total_sale > 0 && margin_pct < 10,
      no_contract_sum: sag.contract_sum == null && sag.revised_sum == null,
    }

    const result: ServiceCaseEconomy = {
      case_id: caseId,
      case_status: sag.status as ServiceCaseStatus,
      contract_sum: sag.contract_sum == null ? null : Number(sag.contract_sum),
      revised_sum: sag.revised_sum == null ? null : Number(sag.revised_sum),
      budget: sag.budget == null ? null : Number(sag.budget),
      planned_hours: sag.planned_hours == null ? null : Number(sag.planned_hours),
      low_profit: !!sag.low_profit,

      labor: {
        work_order_count,
        time_log_count: timeRows.length,
        open_timer_count,
        total_hours: r2(total_hours),
        total_cost: r2(total_labor_cost),
        total_sales_price: r2(total_labor_sale),
        employees_without_rate_count,
      },
      materials: {
        line_count: matRows.length,
        total_cost: r2(mat_cost),
        total_sales_price: r2(mat_sale),
        lines_without_cost: mat_without_cost,
        lines_without_sale: mat_without_sale,
      },
      other_costs: {
        line_count: otherRows.length,
        total_cost: r2(oth_cost),
        total_sales_price: r2(oth_sale),
        lines_without_sale: oth_without_sale,
      },
      totals: {
        cost: r2(total_cost),
        sales_price: r2(total_sale),
        contribution_margin: r2(cm),
        margin_percentage: r2(margin_pct),
      },
      invoicing: {
        has_invoice_data,
        invoice_count: invRows.length,
        invoiced_total: r2(invoiced_total),
        invoiced_paid: r2(invoiced_paid),
        remaining_to_invoice,
      },
      quality_flags: flags,
    }

    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}
