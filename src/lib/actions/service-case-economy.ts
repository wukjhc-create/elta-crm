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

  supplier_invoices: {
    /** total incoming_invoices linked to this sag (any status) */
    count: number
    awaiting_approval_count: number
    approved_count: number
    rejected_count: number
    /** Sum of amount_incl_vat across linked invoices regardless of status. */
    total_amount_incl_vat: number
    /**
     * Sum of incoming_invoice_lines.total_price across linked invoices
     * for lines that are NOT yet converted (approved + line.converted_at IS NULL).
     * Indicates work pending. Read-only — does NOT add to totals.cost.
     */
    unconverted_amount: number
    unconverted_line_count: number
    /** Lines explicitly converted to case_materials. */
    converted_to_material_count: number
    /** Lines explicitly converted to case_other_costs. */
    converted_to_other_count: number
    /** Lines explicitly skipped during approve. */
    skipped_count: number
    /** Approved invoices that still have unconverted lines (operator action needed). */
    approved_with_unconverted_count: number
    /** Click-through list for the UI (cap 50). */
    list: Array<{
      id: string
      status: string
      supplier_name: string | null
      invoice_number: string | null
      invoice_date: string | null
      amount_incl_vat: number | null
      line_count: number
      converted_count: number
      unconverted_count: number
    }>
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
    unconverted_supplier_invoice_lines: boolean
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

    // 3. Parallel: time_logs, case_materials, case_other_costs,
    //    outgoing invoices, incoming (supplier) invoices + their lines
    const [
      timeLogsRes,
      materialsRes,
      otherCostsRes,
      invoicesRes,
      supplierInvoicesRes,
    ] = await Promise.all([
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
      supabase
        .from('incoming_invoices')
        .select(`
          id, status, amount_incl_vat, invoice_number, invoice_date,
          supplier_name_extracted,
          supplier:suppliers(name),
          lines:incoming_invoice_lines(
            total_price,
            converted_case_material_id,
            converted_case_other_cost_id,
            converted_at
          )
        `)
        .eq('matched_case_id', caseId)
        .order('invoice_date', { ascending: false, nullsFirst: false })
        .limit(50),
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

    // ---- Supplier invoices rollup (Sprint 5E-4) ----
    // NOTE: amounts here are READ-ONLY for display. They do NOT add to
    // totals.cost — that comes from case_materials/case_other_costs only,
    // which is where converted invoice lines already land. Avoids double
    // counting.
    type SupplierInvoiceRow = {
      id: string
      status: string
      amount_incl_vat: number | string | null
      invoice_number: string | null
      invoice_date: string | null
      supplier_name_extracted: string | null
      supplier: { name: string | null } | { name: string | null }[] | null
      lines:
        | Array<{
            total_price: number | string | null
            converted_case_material_id: string | null
            converted_case_other_cost_id: string | null
            converted_at: string | null
          }>
        | null
    }
    const sInvRows = (supplierInvoicesRes.data ?? []) as SupplierInvoiceRow[]

    let si_count = 0
    let si_awaiting = 0
    let si_approved = 0
    let si_rejected = 0
    let si_total_incl_vat = 0
    let si_unconverted_amount = 0
    let si_unconverted_lines = 0
    let si_to_material = 0
    let si_to_other = 0
    let si_skipped = 0
    let si_approved_with_unconverted = 0
    const si_list: ServiceCaseEconomy['supplier_invoices']['list'] = []

    for (const inv of sInvRows) {
      si_count += 1
      if (inv.status === 'awaiting_approval') si_awaiting += 1
      else if (inv.status === 'approved' || inv.status === 'posted') si_approved += 1
      else if (inv.status === 'rejected' || inv.status === 'cancelled') si_rejected += 1
      si_total_incl_vat += Number(inv.amount_incl_vat ?? 0)

      const lines = Array.isArray(inv.lines) ? inv.lines : []
      let convertedLinesOnInvoice = 0
      let unconvertedLinesOnInvoice = 0
      for (const ln of lines) {
        const isConvertedMat = !!ln.converted_case_material_id
        const isConvertedOther = !!ln.converted_case_other_cost_id
        const isExplicitlySkipped = !!ln.converted_at && !isConvertedMat && !isConvertedOther
        if (isConvertedMat) {
          si_to_material += 1
          convertedLinesOnInvoice += 1
        } else if (isConvertedOther) {
          si_to_other += 1
          convertedLinesOnInvoice += 1
        } else if (isExplicitlySkipped) {
          si_skipped += 1
          convertedLinesOnInvoice += 1
        } else {
          si_unconverted_lines += 1
          si_unconverted_amount += Number(ln.total_price ?? 0)
          unconvertedLinesOnInvoice += 1
        }
      }
      if ((inv.status === 'approved' || inv.status === 'posted') && unconvertedLinesOnInvoice > 0) {
        si_approved_with_unconverted += 1
      }

      const supplierObj = Array.isArray(inv.supplier) ? inv.supplier[0] : inv.supplier
      const supplierName = supplierObj?.name ?? inv.supplier_name_extracted ?? null

      si_list.push({
        id: inv.id,
        status: inv.status,
        supplier_name: supplierName,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        amount_incl_vat:
          inv.amount_incl_vat == null ? null : Number(inv.amount_incl_vat),
        line_count: lines.length,
        converted_count: convertedLinesOnInvoice,
        unconverted_count: unconvertedLinesOnInvoice,
      })
    }

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
      unconverted_supplier_invoice_lines: si_approved_with_unconverted > 0,
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
      supplier_invoices: {
        count: si_count,
        awaiting_approval_count: si_awaiting,
        approved_count: si_approved,
        rejected_count: si_rejected,
        total_amount_incl_vat: r2(si_total_incl_vat),
        unconverted_amount: r2(si_unconverted_amount),
        unconverted_line_count: si_unconverted_lines,
        converted_to_material_count: si_to_material,
        converted_to_other_count: si_to_other,
        skipped_count: si_skipped,
        approved_with_unconverted_count: si_approved_with_unconverted,
        list: si_list,
      },
      quality_flags: flags,
    }

    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: formatError(error, 'Uventet fejl') }
  }
}
