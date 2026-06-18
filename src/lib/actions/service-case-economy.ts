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

import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
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

  /** Sprint Ø3.0 — klar-til-fakturering-status (beregnet ud fra invoice_line_id). */
  billing: {
    status: 'no_work' | 'ready_to_bill' | 'partially_billed' | 'fully_billed'
    unbilled_time_logs: number
    unbilled_materials: number
    unbilled_other: number
    /** Antal ikke-fakturerede, fakturerbare linjer i alt. */
    unbilled_count: number
    /** Salgsværdi af ikke-fakturerede linjer (snapshot). */
    unbilled_sale_total: number
    /** Antal linjer der allerede er fakturalåst (invoice_line_id sat). */
    billed_line_count: number
    has_open_timer: boolean
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
    // Sprint Ø2.11 — sagøkonomi afslører intern kost/DB → kræver
    // economy.cost_prices (defense in depth, ikke kun UI-gating).
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('economy.cost_prices')) {
      return { success: false, error: 'Manglende tilladelse: economy.cost_prices' }
    }

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
        ? Promise.resolve({ data: [] as Array<{ hours: number | null; end_time: string | null; cost_amount: number | null; sale_amount: number | null; billable: boolean | null; invoice_line_id: string | null; employee: { hourly_rate: number | null } | null }> })
        : supabase
            .from('time_logs')
            .select('hours, end_time, cost_amount, sale_amount, billable, invoice_line_id, employee:employees(hourly_rate)')
            .in('work_order_id', woIds),
      supabase
        .from('case_materials')
        .select('total_cost, total_sales_price, unit_cost, unit_sales_price, billable, invoice_line_id')
        .eq('case_id', caseId),
      supabase
        .from('case_other_costs')
        .select('total_cost, total_sales_price, unit_sales_price, billable, invoice_line_id')
        .eq('case_id', caseId),
      // Sprint 1B driftsfix: Migration 00104 tilfoejede invoices.case_id som
      // direkte FK til sagen. Alle nye invoices bruger case_id (work_order_id
      // er null). Den gamle work_order_id-baserede join returnerede derfor
      // altid 0 invoices paa enhver sag → Fakturering-panelet viste 0 kr
      // selv om der laa faktureret beloeb. Fix: join paa case_id direkte.
      supabase
        .from('invoices')
        .select('total_amount, amount_paid')
        .eq('case_id', caseId),
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
      sale_amount: number | string | null
      billable: boolean | null
      invoice_line_id: string | null
      employee: { hourly_rate: number | string | null } | Array<{ hourly_rate: number | string | null }> | null
    }>
    let total_hours = 0
    let total_labor_cost = 0
    let total_labor_sale = 0
    let open_timer_count = 0
    let employees_without_rate_count = 0
    // Sprint Ø3.0 — klar-til-fakturering: tæl ikke-fakturerede vs. fakturerede.
    let unbilled_time_logs = 0
    let unbilled_time_sale = 0
    let billed_line_count = 0
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
      // Salgs-side: brug frosset sale_amount (00136/00137 snapshot) når den
      // findes; historiske raekker uden snapshot falder tilbage til den gamle
      // live-beregning hours * employees.hourly_rate (uaendret adfaerd).
      const saleSnapshot = tl.sale_amount == null ? null : Number(tl.sale_amount)
      const lineSale = saleSnapshot != null && Number.isFinite(saleSnapshot)
        ? saleSnapshot
        : (Number.isFinite(hours) && rate != null ? hours * rate : 0)
      total_labor_sale += lineSale
      // Klar-til-fakturering: fakturalåst vs. fakturerbar & ikke-faktureret.
      if (tl.invoice_line_id) billed_line_count += 1
      else if (tl.billable !== false) { unbilled_time_logs += 1; unbilled_time_sale += lineSale }
    }

    // ---- Materials rollup ----
    const matRows = (materialsRes.data ?? []) as Array<{
      total_cost: number | string | null
      total_sales_price: number | string | null
      unit_cost: number | string | null
      unit_sales_price: number | string | null
      billable: boolean | null
      invoice_line_id: string | null
    }>
    let mat_cost = 0
    let mat_sale = 0
    let mat_without_cost = 0
    let mat_without_sale = 0
    let unbilled_materials = 0
    let unbilled_mat_sale = 0
    for (const m of matRows) {
      mat_cost += Number(m.total_cost ?? 0)
      const matSale = Number(m.total_sales_price ?? 0)
      mat_sale += matSale
      if (Number(m.unit_cost ?? 0) === 0) mat_without_cost += 1
      if (Number(m.unit_sales_price ?? 0) === 0) mat_without_sale += 1
      if (m.invoice_line_id) billed_line_count += 1
      else if (m.billable !== false) { unbilled_materials += 1; unbilled_mat_sale += matSale }
    }

    // ---- Other costs rollup ----
    const otherRows = (otherCostsRes.data ?? []) as Array<{
      total_cost: number | string | null
      total_sales_price: number | string | null
      unit_sales_price: number | string | null
      billable: boolean | null
      invoice_line_id: string | null
    }>
    let oth_cost = 0
    let oth_sale = 0
    let oth_without_sale = 0
    let unbilled_other = 0
    let unbilled_oth_sale = 0
    for (const o of otherRows) {
      oth_cost += Number(o.total_cost ?? 0)
      const othSale = Number(o.total_sales_price ?? 0)
      oth_sale += othSale
      if (Number(o.unit_sales_price ?? 0) === 0) oth_without_sale += 1
      if (o.invoice_line_id) billed_line_count += 1
      else if (o.billable !== false) { unbilled_other += 1; unbilled_oth_sale += othSale }
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

    // ---- Klar-til-fakturering-status (Sprint Ø3.0) ----
    const unbilled_count = unbilled_time_logs + unbilled_materials + unbilled_other
    const unbilled_sale_total = r2(unbilled_time_sale + unbilled_mat_sale + unbilled_oth_sale)
    const has_work = timeRows.length > 0 || matRows.length > 0 || otherRows.length > 0
    let billing_status: ServiceCaseEconomy['billing']['status']
    if (!has_work) billing_status = 'no_work'
    else if (unbilled_count > 0 && billed_line_count > 0) billing_status = 'partially_billed'
    else if (unbilled_count > 0) billing_status = 'ready_to_bill'
    else billing_status = 'fully_billed'

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
      billing: {
        status: billing_status,
        unbilled_time_logs,
        unbilled_materials,
        unbilled_other,
        unbilled_count,
        unbilled_sale_total,
        billed_line_count,
        has_open_timer: open_timer_count > 0,
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

// =====================================================================
// Sprint Ø3.1 — KOST-FRI faktureringsstatus (til kontor/salg uden
// economy.cost_prices). Returnerer KUN salgs-/faktureringsdata — ingen
// intern kost/DB. Gated af invoices.view.own_cases (bred adgang inkl. salg).
// =====================================================================

export interface CaseBillingStatus {
  status: 'no_work' | 'ready_to_bill' | 'partially_billed' | 'fully_billed'
  unbilled_time_logs: number
  unbilled_materials: number
  unbilled_other: number
  unbilled_count: number
  unbilled_sale_total: number
  billed_line_count: number
  has_open_timer: boolean
  invoiced_total: number
  remaining_to_invoice: number | null
}

export async function getServiceCaseBillingStatus(
  caseId: string
): Promise<ActionResult<CaseBillingStatus>> {
  try {
    validateUUID(caseId, 'case_id')
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('invoices.view.own_cases')) {
      return { success: false, error: 'Manglende tilladelse: invoices.view.own_cases' }
    }

    const { data: sag } = await supabase
      .from('service_cases')
      .select('id, contract_sum, revised_sum')
      .eq('id', caseId)
      .maybeSingle()
    if (!sag) return { success: false, error: 'Sag ikke fundet' }

    const { data: wos } = await supabase.from('work_orders').select('id').eq('case_id', caseId)
    const woIds = (wos ?? []).map((w) => w.id as string)

    const [tlRes, matRes, othRes, invRes] = await Promise.all([
      woIds.length === 0
        ? Promise.resolve({ data: [] as Array<{ end_time: string | null; sale_amount: number | string | null; billable: boolean | null; invoice_line_id: string | null }> })
        : supabase.from('time_logs').select('end_time, sale_amount, billable, invoice_line_id').in('work_order_id', woIds),
      supabase.from('case_materials').select('total_sales_price, billable, invoice_line_id').eq('case_id', caseId),
      supabase.from('case_other_costs').select('total_sales_price, billable, invoice_line_id').eq('case_id', caseId),
      supabase.from('invoices').select('total_amount').eq('case_id', caseId),
    ])

    const tl = (tlRes.data ?? []) as Array<{ end_time: string | null; sale_amount: number | string | null; billable: boolean | null; invoice_line_id: string | null }>
    const mat = (matRes.data ?? []) as Array<{ total_sales_price: number | string | null; billable: boolean | null; invoice_line_id: string | null }>
    const oth = (othRes.data ?? []) as Array<{ total_sales_price: number | string | null; billable: boolean | null; invoice_line_id: string | null }>

    let ut = 0, um = 0, uo = 0, usale = 0, billed = 0, openTimer = false
    for (const r of tl) {
      if (r.end_time === null) { openTimer = true; continue }
      if (r.invoice_line_id) billed += 1
      else if (r.billable !== false) { ut += 1; usale += Number(r.sale_amount ?? 0) }
    }
    for (const r of mat) {
      if (r.invoice_line_id) billed += 1
      else if (r.billable !== false) { um += 1; usale += Number(r.total_sales_price ?? 0) }
    }
    for (const r of oth) {
      if (r.invoice_line_id) billed += 1
      else if (r.billable !== false) { uo += 1; usale += Number(r.total_sales_price ?? 0) }
    }

    const unbilled = ut + um + uo
    const hasWork = tl.length > 0 || mat.length > 0 || oth.length > 0
    let status: CaseBillingStatus['status']
    if (!hasWork) status = 'no_work'
    else if (unbilled > 0 && billed > 0) status = 'partially_billed'
    else if (unbilled > 0) status = 'ready_to_bill'
    else status = 'fully_billed'

    const invoiced_total = ((invRes.data ?? []) as Array<{ total_amount: number | string | null }>)
      .reduce((s, i) => s + Number(i.total_amount ?? 0), 0)
    const refSum = sag.revised_sum != null ? Number(sag.revised_sum)
      : sag.contract_sum != null ? Number(sag.contract_sum) : null

    return {
      success: true,
      data: {
        status,
        unbilled_time_logs: ut,
        unbilled_materials: um,
        unbilled_other: uo,
        unbilled_count: unbilled,
        unbilled_sale_total: r2(usale),
        billed_line_count: billed,
        has_open_timer: openTimer,
        invoiced_total: r2(invoiced_total),
        remaining_to_invoice: refSum != null ? r2(refSum - invoiced_total) : null,
      },
    }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke hente faktureringsstatus') }
  }
}

// =====================================================
// Sprint Ø8.0 — Cost-free projektøkonomi pr. sag (faktura-side)
// =====================================================

export interface CaseProjectEconomy {
  has_contract_sum: boolean
  /** Effektiv kontraktsum (revised_sum hvis sat, ellers contract_sum). */
  contract_sum: number | null
  /** Brutto faktureret: gyldige (ikke-voided, udstedte) standard-fakturaer. */
  invoiced_total: number
  /** Kreditnotaer (gyldige). Reducerer netto faktureret. */
  credited_total: number
  /** Netto faktureret = invoiced_total - credited_total. */
  net_invoiced: number
  /** Modtaget betaling (amount_paid på gyldige standard-fakturaer). */
  paid_total: number
  /** Udestående saldo = netto faktureret - betalt (min 0). */
  outstanding_total: number
  /** Rest at fakturere = kontraktsum - netto faktureret (null uden kontraktsum). */
  remaining_to_invoice: number | null
  /** Antal gyldige udstedte fakturaer (standard + kredit). */
  invoice_count: number
  /** Antal annullerede (voided) fakturaer — kun til info. */
  voided_count: number
  currency: string
  latest_invoice: {
    id: string
    invoice_number: string | null
    invoice_type: string | null
    status: string | null
    final_amount: number | null
    created_at: string | null
  } | null
}

/**
 * Cost-free projektøkonomi pr. sag. KUN salgs-/fakturadata — INGEN intern
 * kost, timekost, materialekost, margin, DB eller dækningsbidrag. Read-only
 * (ingen audit). Gated invoices.view.own_cases (samme som Ø3-faktureringen).
 * Ét invoice-query (ingen N+1). Håndterer ingen kontraktsum / ingen fakturaer
 * / kreditnotaer / annullerede fakturaer korrekt.
 */
export async function getServiceCaseProjectEconomy(
  caseId: string
): Promise<ActionResult<CaseProjectEconomy>> {
  try {
    validateUUID(caseId, 'case_id')
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('invoices.view.own_cases')) {
      return { success: false, error: 'Manglende tilladelse: invoices.view.own_cases' }
    }

    const { data: sag } = await supabase
      .from('service_cases')
      .select('id, contract_sum, revised_sum')
      .eq('id', caseId)
      .maybeSingle()
    if (!sag) return { success: false, error: 'Sag ikke fundet' }

    // Ét cost-free invoice-query (kun salgs-/status-felter).
    const { data: invs } = await supabase
      .from('invoices')
      .select('id, invoice_number, final_amount, amount_paid, status, invoice_type, voided_at, currency, created_at')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })

    const rows = (invs ?? []) as Array<{
      id: string; invoice_number: string | null; final_amount: number | string | null
      amount_paid: number | string | null; status: string | null; invoice_type: string | null
      voided_at: string | null; currency: string | null; created_at: string | null
    }>

    const ISSUED = new Set(['sent', 'paid'])
    let invoiced = 0, credited = 0, paid = 0, invoiceCount = 0, voidedCount = 0
    let currency = 'DKK'
    let latest: CaseProjectEconomy['latest_invoice'] = null

    for (const r of rows) {
      if (r.voided_at) { voidedCount++; continue }            // annulleret → tæller ikke med
      if (!ISSUED.has(r.status ?? '')) continue                // kladder ekskluderes
      if (r.currency) currency = r.currency
      const amount = Number(r.final_amount ?? 0)
      if (r.invoice_type === 'credit') {
        credited += Math.abs(amount)
      } else {
        invoiced += amount
        paid += Number(r.amount_paid ?? 0)
      }
      invoiceCount++
      if (!latest) {
        latest = {
          id: r.id, invoice_number: r.invoice_number, invoice_type: r.invoice_type,
          status: r.status, final_amount: amount, created_at: r.created_at,
        }
      }
    }

    const netInvoiced = invoiced - credited
    const outstanding = Math.max(0, netInvoiced - paid)
    const refSum = sag.revised_sum != null ? Number(sag.revised_sum)
      : sag.contract_sum != null ? Number(sag.contract_sum) : null

    return {
      success: true,
      data: {
        has_contract_sum: refSum != null,
        contract_sum: refSum != null ? r2(refSum) : null,
        invoiced_total: r2(invoiced),
        credited_total: r2(credited),
        net_invoiced: r2(netInvoiced),
        paid_total: r2(paid),
        outstanding_total: r2(outstanding),
        remaining_to_invoice: refSum != null ? r2(refSum - netInvoiced) : null,
        invoice_count: invoiceCount,
        voided_count: voidedCount,
        currency,
        latest_invoice: latest,
      },
    }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke hente projektøkonomi') }
  }
}

// =====================================================
// Sprint Ø8.1 — Batch projektøkonomi (sagsliste + portefølje)
// =====================================================

export interface CaseEconomyBatchEntry {
  net_invoiced: number
  outstanding_total: number
  remaining_to_invoice: number | null
  has_contract_sum: boolean
  invoice_count: number
}

const ISSUED_STATUSES = new Set(['sent', 'paid'])

/**
 * Aggreger Ø8.0-projektøkonomien for FLERE sager i ÉN invoice-query (+ én
 * service_cases-query for kontraktsum). Ingen N+1. Gated invoices.view.own_cases.
 * Cost-free — kun salgs-/fakturatal. Returnerer map keyed på case_id.
 */
export async function getServiceCaseEconomyBatch(
  caseIds: string[]
): Promise<ActionResult<Record<string, CaseEconomyBatchEntry>>> {
  try {
    const ids = Array.from(new Set((caseIds ?? []).filter(Boolean)))
    if (ids.length === 0) return { success: true, data: {} }

    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('invoices.view.own_cases')) {
      return { success: false, error: 'Manglende tilladelse: invoices.view.own_cases' }
    }

    const [caseRes, invRes] = await Promise.all([
      supabase.from('service_cases').select('id, contract_sum, revised_sum').in('id', ids),
      supabase.from('invoices')
        .select('case_id, final_amount, amount_paid, status, invoice_type, voided_at')
        .in('case_id', ids),
    ])

    const refByCase = new Map<string, number | null>()
    for (const c of (caseRes.data ?? []) as Array<{ id: string; contract_sum: number | string | null; revised_sum: number | string | null }>) {
      const ref = c.revised_sum != null ? Number(c.revised_sum) : c.contract_sum != null ? Number(c.contract_sum) : null
      refByCase.set(c.id, ref)
    }

    const agg = new Map<string, { invoiced: number; credited: number; paid: number; count: number }>()
    for (const r of (invRes.data ?? []) as Array<{ case_id: string | null; final_amount: number | string | null; amount_paid: number | string | null; status: string | null; invoice_type: string | null; voided_at: string | null }>) {
      if (!r.case_id) continue
      if (r.voided_at) continue
      if (!ISSUED_STATUSES.has(r.status ?? '')) continue
      const cur = agg.get(r.case_id) ?? { invoiced: 0, credited: 0, paid: 0, count: 0 }
      const amt = Number(r.final_amount ?? 0)
      if (r.invoice_type === 'credit') cur.credited += Math.abs(amt)
      else { cur.invoiced += amt; cur.paid += Number(r.amount_paid ?? 0) }
      cur.count += 1
      agg.set(r.case_id, cur)
    }

    const out: Record<string, CaseEconomyBatchEntry> = {}
    for (const id of ids) {
      const a = agg.get(id) ?? { invoiced: 0, credited: 0, paid: 0, count: 0 }
      const ref = refByCase.get(id) ?? null
      const net = a.invoiced - a.credited
      out[id] = {
        net_invoiced: r2(net),
        outstanding_total: r2(Math.max(0, net - a.paid)),
        remaining_to_invoice: ref != null ? r2(ref - net) : null,
        has_contract_sum: ref != null,
        invoice_count: a.count,
      }
    }
    return { success: true, data: out }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke hente sagsøkonomi') }
  }
}

export interface OutstandingPortfolio {
  total_outstanding: number
  total_net_invoiced: number
  cases_with_outstanding: number
  currency: string
  top: Array<{ case_id: string; case_number: string | null; title: string | null; outstanding: number }>
}

/**
 * Portefølje-summary: udestående på tværs af aktive (ikke-lukkede) sager.
 * To queries (invoices + service_cases) — ingen N+1. Gated/cost-free/read-only.
 */
export async function getCaseOutstandingPortfolioAction(): Promise<ActionResult<OutstandingPortfolio>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('invoices.view.own_cases')) {
      return { success: false, error: 'Manglende tilladelse: invoices.view.own_cases' }
    }

    // Udstedte, ikke-voided fakturaer (cost-free felter).
    const { data: invs } = await supabase
      .from('invoices')
      .select('case_id, final_amount, amount_paid, status, invoice_type, voided_at, currency')
      .in('status', ['sent', 'paid'])
      .is('voided_at', null)

    const agg = new Map<string, { invoiced: number; credited: number; paid: number }>()
    let currency = 'DKK'
    for (const r of (invs ?? []) as Array<{ case_id: string | null; final_amount: number | string | null; amount_paid: number | string | null; invoice_type: string | null; currency: string | null }>) {
      if (!r.case_id) continue
      if (r.currency) currency = r.currency
      const cur = agg.get(r.case_id) ?? { invoiced: 0, credited: 0, paid: 0 }
      const amt = Number(r.final_amount ?? 0)
      if (r.invoice_type === 'credit') cur.credited += Math.abs(amt)
      else { cur.invoiced += amt; cur.paid += Number(r.amount_paid ?? 0) }
      agg.set(r.case_id, cur)
    }

    const caseIds = Array.from(agg.keys())
    if (caseIds.length === 0) {
      return { success: true, data: { total_outstanding: 0, total_net_invoiced: 0, cases_with_outstanding: 0, currency, top: [] } }
    }

    // Kun aktive (ikke-lukkede) sager tæller med.
    const { data: cases } = await supabase
      .from('service_cases')
      .select('id, case_number, title, status')
      .in('id', caseIds)
    const activeMeta = new Map<string, { case_number: string | null; title: string | null }>()
    for (const c of (cases ?? []) as Array<{ id: string; case_number: string | null; title: string | null; status: string | null }>) {
      if (c.status === 'closed') continue
      activeMeta.set(c.id, { case_number: c.case_number, title: c.title })
    }

    let totalOutstanding = 0, totalNet = 0, withOutstanding = 0
    const perCase: Array<{ case_id: string; case_number: string | null; title: string | null; outstanding: number }> = []
    for (const [id, a] of agg) {
      const meta = activeMeta.get(id)
      if (!meta) continue // kun aktive sager
      const net = a.invoiced - a.credited
      const outstanding = Math.max(0, net - a.paid)
      totalNet += net
      totalOutstanding += outstanding
      if (outstanding > 0) {
        withOutstanding++
        perCase.push({ case_id: id, case_number: meta.case_number, title: meta.title, outstanding: r2(outstanding) })
      }
    }
    perCase.sort((x, y) => y.outstanding - x.outstanding)

    return {
      success: true,
      data: {
        total_outstanding: r2(totalOutstanding),
        total_net_invoiced: r2(totalNet),
        cases_with_outstanding: withOutstanding,
        currency,
        top: perCase.slice(0, 3),
      },
    }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke hente porteføljeøkonomi') }
  }
}

// =====================================================
// Sprint Ø8.3 — Faktureringsopfølgnings-summary (dashboard-widget)
// =====================================================

export interface BillingFollowupSummary {
  over_invoiced: number
  ready_final: number
  outstanding: number
  no_contract: number
  /** Sum af handlingskrævende (over + ready + outstanding) — til tom-state. */
  total_action: number
  /** Sandt hvis kandidat-sættet ramte cap'en (tal kan være ufuldstændige). */
  capped: boolean
}

// Bounded scope (samme cap som Ø8.2-sagslistefilteret). Dokumenteret tradeoff:
// summen dækker op til N relevante sager (sager m. fakturaer + afsluttede sager).
const BILLING_FOLLOWUP_CAP = 500

/**
 * Cost-free faktureringsopfølgning til dashboard-widgeten. Tæller sager pr.
 * Ø8.2-handlingsstatus (genbruger caseMatchesBillingFilter — ingen nye regler).
 * Read-only, gated invoices.view.own_cases. Bounded queries: invoices +
 * service_cases (fakturerede + afsluttede) — ingen N+1. KUN salgs-/fakturatal.
 */
export async function getBillingFollowupSummaryAction(): Promise<ActionResult<BillingFollowupSummary>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('invoices.view.own_cases')) {
      return { success: false, error: 'Manglende tilladelse: invoices.view.own_cases' }
    }
    const { caseMatchesBillingFilter } = await import('@/lib/invoices/case-billing-status')

    // 1) Udstedte, ikke-voided fakturaer (cost-free) → aggreger pr. sag.
    const { data: invs } = await supabase
      .from('invoices')
      .select('case_id, final_amount, amount_paid, status, invoice_type, voided_at')
      .in('status', ['sent', 'paid'])
      .is('voided_at', null)

    const agg = new Map<string, { invoiced: number; credited: number; paid: number; count: number }>()
    for (const r of (invs ?? []) as Array<{ case_id: string | null; final_amount: number | string | null; amount_paid: number | string | null; invoice_type: string | null }>) {
      if (!r.case_id) continue
      const cur = agg.get(r.case_id) ?? { invoiced: 0, credited: 0, paid: 0, count: 0 }
      const amt = Number(r.final_amount ?? 0)
      if (r.invoice_type === 'credit') cur.credited += Math.abs(amt)
      else { cur.invoiced += amt; cur.paid += Number(r.amount_paid ?? 0) }
      cur.count += 1
      agg.set(r.case_id, cur)
    }
    const invoicedIds = Array.from(agg.keys())

    // 2) Kandidat-sager: dem med fakturaer + alle afsluttede (ready_final kan
    //    gælde en afsluttet sag uden fakturaer). Bounded queries.
    const caseMeta = new Map<string, { status: string | null; ref: number | null }>()
    const addRows = (rows: Array<{ id: string; status: string | null; contract_sum: number | string | null; revised_sum: number | string | null }>) => {
      for (const c of rows) {
        const ref = c.revised_sum != null ? Number(c.revised_sum) : c.contract_sum != null ? Number(c.contract_sum) : null
        caseMeta.set(c.id, { status: c.status, ref })
      }
    }
    if (invoicedIds.length) {
      const { data } = await supabase
        .from('service_cases')
        .select('id, status, contract_sum, revised_sum')
        .in('id', invoicedIds.slice(0, BILLING_FOLLOWUP_CAP))
      addRows((data ?? []) as never)
    }
    const { data: closedRows } = await supabase
      .from('service_cases')
      .select('id, status, contract_sum, revised_sum')
      .eq('status', 'closed')
      .limit(BILLING_FOLLOWUP_CAP)
    addRows((closedRows ?? []) as never)

    const capped = invoicedIds.length > BILLING_FOLLOWUP_CAP || (closedRows?.length ?? 0) >= BILLING_FOLLOWUP_CAP

    // 3) Byg cost-free entry pr. kandidat-sag + tæl via Ø8.2-reglerne.
    let over = 0, ready = 0, outstanding = 0, noContract = 0
    for (const [id, meta] of caseMeta) {
      const a = agg.get(id) ?? { invoiced: 0, credited: 0, paid: 0, count: 0 }
      const net = a.invoiced - a.credited
      const entry = {
        net_invoiced: r2(net),
        outstanding_total: r2(Math.max(0, net - a.paid)),
        remaining_to_invoice: meta.ref != null ? r2(meta.ref - net) : null,
        has_contract_sum: meta.ref != null,
        invoice_count: a.count,
      }
      if (caseMatchesBillingFilter(entry, meta.status, 'over_invoiced')) over++
      if (caseMatchesBillingFilter(entry, meta.status, 'ready_final')) ready++
      if (caseMatchesBillingFilter(entry, meta.status, 'outstanding')) outstanding++
      // no_contract: kun handlingsrelevant når sagen rent faktisk er faktureret.
      if (a.count > 0 && caseMatchesBillingFilter(entry, meta.status, 'no_contract')) noContract++
    }

    return {
      success: true,
      data: {
        over_invoiced: over,
        ready_final: ready,
        outstanding,
        no_contract: noContract,
        total_action: over + ready + outstanding,
        capped,
      },
    }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke hente faktureringsopfølgning') }
  }
}

// =====================================================
// Sprint Ø9.3 — Intern indkøb-vs-budget pr. sag (INTERN KOST)
// =====================================================
//
// INTERN INDKØBSØKONOMI — gated economy.cost_prices (samme interne kost-gate
// som Økonomi-fanen). MÅ IKKE blandes ind i Ø8 cost-free salgs-/projekt-
// økonomi (getServiceCaseProjectEconomy / billing). Viser leverandørfaktura-
// omkostninger (case_materials/case_other_costs m. source='supplier_invoice')
// op mod budget/kontraktsum som ren reference — IKKE dækningsbidrag/margin.
// Read-only, ingen audit, ingen e-conomic-push. Ét query pr. kilde (ingen N+1).

const SUPPLIER_INVOICE_SOURCE = 'supplier_invoice'
// Bounded: en sag har realistisk få leverandører. Cap så payload aldrig
// vokser ukontrolleret selv ved data-fejl.
const PURCHASE_BREAKDOWN_CAP = 25
const PURCHASE_UNKNOWN_SUPPLIER = 'Ukendt leverandør'

/** Intern indkøbskost pr. leverandør (kun kost — ingen salg/margin). */
export interface CasePurchaseSupplierBreakdown {
  supplier_name: string
  material_cost: number
  other_cost: number
  total_cost: number
  line_count: number
}

export interface CasePurchaseSummary {
  ok: boolean
  message?: string
  supplier_material_cost_total: number
  supplier_other_cost_total: number
  supplier_purchase_total: number
  /** Antal konverterede leverandørfaktura-linjer (materialer + udlæg). */
  converted_line_count: number
  /** Antal konverterede materialer fra leverandørfaktura. */
  converted_material_count: number
  /** Antal konverterede øvrige omkostninger fra leverandørfaktura. */
  converted_other_cost_count: number
  /** Intern indkøbskost grupperet pr. leverandør (kost, ikke margin). */
  supplier_breakdown: CasePurchaseSupplierBreakdown[]
  currency: string
  /** Reference (IKKE margin/DB): budget eller kontraktsum, hvis sat. */
  budget_reference: number | null
  budget_reference_kind: 'budget' | 'contract' | null
  invoices: Array<{ id: string; invoice_number: string | null; supplier_name: string | null; invoice_date: string | null; amount_incl_vat: number | null }>
  /** Markør: dette er intern indkøbsøkonomi, ikke kundevendt salg. */
  internal_purchase: true
}

export async function getServiceCasePurchaseSummary(caseId: string): Promise<CasePurchaseSummary> {
  const base: CasePurchaseSummary = {
    ok: false, supplier_material_cost_total: 0, supplier_other_cost_total: 0, supplier_purchase_total: 0,
    converted_line_count: 0, converted_material_count: 0, converted_other_cost_count: 0,
    supplier_breakdown: [], currency: 'DKK', budget_reference: null, budget_reference_kind: null,
    invoices: [], internal_purchase: true,
  }
  try {
    validateUUID(caseId, 'case_id')
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    // Intern kost-gate — IKKE den cost-free billing-gate fra Ø8.
    if (!hasPermission('economy.cost_prices')) {
      return { ...base, message: 'Manglende tilladelse: economy.cost_prices' }
    }

    // Ét query pr. kilde + sag + leverandørfakturaer (matched_case_id). Ingen N+1.
    // supplier_name_snapshot/supplier_name hentes til breakdown — begge er
    // interne kost-felter, ingen salgspris/margin med i payload.
    const [matRes, othRes, sagRes, invRes] = await Promise.all([
      supabase.from('case_materials')
        .select('total_cost, supplier_name_snapshot, source_incoming_invoice_line_id')
        .eq('case_id', caseId).eq('source', SUPPLIER_INVOICE_SOURCE),
      supabase.from('case_other_costs')
        .select('total_cost, supplier_name, source_incoming_invoice_line_id')
        .eq('case_id', caseId).eq('source', SUPPLIER_INVOICE_SOURCE),
      supabase.from('service_cases').select('contract_sum, revised_sum, budget').eq('id', caseId).maybeSingle(),
      supabase.from('incoming_invoices')
        .select('id, invoice_number, supplier_name_extracted, invoice_date, amount_incl_vat, currency, supplier:supplier_id ( name )')
        .eq('matched_case_id', caseId)
        .order('invoice_date', { ascending: false })
        .limit(50),
    ])

    const matRows = (matRes.data ?? []) as Array<{ total_cost: number | string | null; supplier_name_snapshot: string | null; source_incoming_invoice_line_id: string | null }>
    const othRows = (othRes.data ?? []) as Array<{ total_cost: number | string | null; supplier_name: string | null; source_incoming_invoice_line_id: string | null }>
    const matTotal = matRows.reduce((s, r) => s + Number(r.total_cost ?? 0), 0)
    const othTotal = othRows.reduce((s, r) => s + Number(r.total_cost ?? 0), 0)

    // Breakdown pr. leverandør — ren JS-aggregering på allerede-hentede rækker
    // (ingen ekstra query, ingen N+1). Nøgle = leverandørnavn (snapshot).
    const breakdownMap = new Map<string, CasePurchaseSupplierBreakdown>()
    const bucket = (name: string | null): CasePurchaseSupplierBreakdown => {
      const key = (name ?? '').trim() || PURCHASE_UNKNOWN_SUPPLIER
      let b = breakdownMap.get(key)
      if (!b) { b = { supplier_name: key, material_cost: 0, other_cost: 0, total_cost: 0, line_count: 0 }; breakdownMap.set(key, b) }
      return b
    }
    for (const r of matRows) {
      const b = bucket(r.supplier_name_snapshot)
      const v = Number(r.total_cost ?? 0)
      b.material_cost += v; b.total_cost += v; b.line_count += 1
    }
    for (const r of othRows) {
      const b = bucket(r.supplier_name)
      const v = Number(r.total_cost ?? 0)
      b.other_cost += v; b.total_cost += v; b.line_count += 1
    }
    const supplier_breakdown = Array.from(breakdownMap.values())
      .map((b) => ({ ...b, material_cost: r2(b.material_cost), other_cost: r2(b.other_cost), total_cost: r2(b.total_cost) }))
      .sort((a, b) => b.total_cost - a.total_cost)
      .slice(0, PURCHASE_BREAKDOWN_CAP)

    const sag = sagRes.data as { contract_sum: number | string | null; revised_sum: number | string | null; budget: number | string | null } | null
    let budgetRef: number | null = null
    let budgetKind: 'budget' | 'contract' | null = null
    if (sag?.budget != null) { budgetRef = Number(sag.budget); budgetKind = 'budget' }
    else if (sag?.revised_sum != null) { budgetRef = Number(sag.revised_sum); budgetKind = 'contract' }
    else if (sag?.contract_sum != null) { budgetRef = Number(sag.contract_sum); budgetKind = 'contract' }

    let currency = 'DKK'
    const invoices = ((invRes.data ?? []) as Array<{ id: string; invoice_number: string | null; supplier_name_extracted: string | null; invoice_date: string | null; amount_incl_vat: number | string | null; currency: string | null; supplier?: { name?: string } | { name?: string }[] | null }>).map((r) => {
      if (r.currency) currency = r.currency
      const supJoin = Array.isArray(r.supplier) ? r.supplier[0]?.name : r.supplier?.name
      return {
        id: r.id, invoice_number: r.invoice_number,
        supplier_name: supJoin ?? r.supplier_name_extracted ?? null,
        invoice_date: r.invoice_date,
        amount_incl_vat: r.amount_incl_vat != null ? Number(r.amount_incl_vat) : null,
      }
    })

    return {
      ok: true,
      supplier_material_cost_total: r2(matTotal),
      supplier_other_cost_total: r2(othTotal),
      supplier_purchase_total: r2(matTotal + othTotal),
      converted_line_count: matRows.length + othRows.length,
      converted_material_count: matRows.length,
      converted_other_cost_count: othRows.length,
      supplier_breakdown,
      currency,
      budget_reference: budgetRef != null ? r2(budgetRef) : null,
      budget_reference_kind: budgetKind,
      invoices,
      internal_purchase: true,
    }
  } catch (e) {
    return { ...base, message: formatError(e, 'Kunne ikke hente indkøbsoverblik') }
  }
}
