'use server'

/**
 * Sprint 6B-2 + 6B-3 — server actions for outgoing invoices.
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import {
  createInvoiceDraftFromCase as createInvoiceDraftFromCaseService,
  type CaseInvoiceSelection,
  type CaseInvoiceOptions,
  type CreateInvoiceDraftResult,
} from '@/lib/services/invoice-from-case'
import { validateUUID } from '@/lib/validations/common'

// =====================================================
// 6B-3 — listUnbilledForCase
// =====================================================

export interface UnbilledTimeLogRow {
  id: string
  date: string                          // start_time::date
  employee_id: string | null
  employee_name: string | null
  work_order_id: string | null
  hours: number
  hourly_rate: number | null            // null when employee has no rate
  total_sales_price: number             // hours × rate (0 if rate null)
  billable: boolean
  description: string | null
  has_rate: boolean
}

export interface UnbilledMaterialRow {
  id: string
  description: string
  quantity: number
  unit: string
  unit_sales_price: number
  total_sales_price: number
  has_sale_price: boolean
  supplier_name: string | null
  source: string                        // 'manual' | 'offer' | 'supplier_invoice' | 'calculator'
}

export interface UnbilledOtherCostRow {
  id: string
  category: string
  description: string
  cost_date: string | null
  quantity: number
  unit: string
  unit_sales_price: number
  total_sales_price: number
  has_sale_price: boolean
  supplier_name: string | null
  source: string
}

export interface UnbilledForCase {
  case_id: string
  case_number: string | null
  customer_id: string | null
  customer_name: string | null
  time_logs: UnbilledTimeLogRow[]
  materials: UnbilledMaterialRow[]
  other_costs: UnbilledOtherCostRow[]
}

export async function listUnbilledForCaseAction(
  caseId: string
): Promise<{ ok: boolean; message?: string; data?: UnbilledForCase }> {
  try {
    validateUUID(caseId, 'case_id')
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ugyldigt case_id' }
  }

  const { supabase } = await getAuthenticatedClient()

  // 1. Sag header
  const { data: sag, error: sagErr } = await supabase
    .from('service_cases')
    .select('id, case_number, customer_id, customer:customers!left(company_name, contact_person)')
    .eq('id', caseId)
    .maybeSingle()
  if (sagErr || !sag) {
    return { ok: false, message: 'Sag ikke fundet' }
  }
  const customerJoin = (sag as unknown as {
    customer?:
      | { company_name: string | null; contact_person: string | null }
      | { company_name: string | null; contact_person: string | null }[]
      | null
  }).customer
  const customerObj = Array.isArray(customerJoin)
    ? customerJoin[0] ?? null
    : customerJoin ?? null
  const customer_name = customerObj?.company_name ?? customerObj?.contact_person ?? null

  // 2. Work orders for the sag (to scope time_logs)
  const { data: wos } = await supabase
    .from('work_orders')
    .select('id')
    .eq('case_id', caseId)
  const woIds = (wos ?? []).map((w) => w.id as string)

  // 3. Parallel: unbilled time_logs (joined with employees), case_materials, case_other_costs
  type TimeLogRow = {
    id: string
    employee_id: string | null
    work_order_id: string | null
    start_time: string | null
    end_time: string | null
    hours: number | string | null
    billable: boolean
    description: string | null
    invoice_line_id: string | null
    employee:
      | { name: string | null; hourly_rate: number | string | null }
      | { name: string | null; hourly_rate: number | string | null }[]
      | null
  }
  const [timeLogsRes, materialsRes, otherCostsRes] = await Promise.all([
    woIds.length === 0
      ? Promise.resolve({ data: [] as TimeLogRow[] })
      : supabase
          .from('time_logs')
          .select(
            'id, employee_id, work_order_id, start_time, end_time, hours, billable, description, invoice_line_id, employee:employees(name, hourly_rate)'
          )
          .in('work_order_id', woIds)
          .is('invoice_line_id', null)
          .not('end_time', 'is', null)
          .order('start_time', { ascending: true }),
    supabase
      .from('case_materials')
      .select(
        'id, description, quantity, unit, unit_sales_price, total_sales_price, billable, invoice_line_id, supplier_name_snapshot, source'
      )
      .eq('case_id', caseId)
      .is('invoice_line_id', null)
      .eq('billable', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('case_other_costs')
      .select(
        'id, category, description, cost_date, quantity, unit, unit_sales_price, total_sales_price, billable, invoice_line_id, supplier_name, source'
      )
      .eq('case_id', caseId)
      .is('invoice_line_id', null)
      .eq('billable', true)
      .order('cost_date', { ascending: true }),
  ])

  // ---- Map time_logs ----
  const timeRows = (timeLogsRes.data ?? []) as unknown as TimeLogRow[]
  const time_logs: UnbilledTimeLogRow[] = timeRows.map((t) => {
    const emp = Array.isArray(t.employee) ? t.employee[0] ?? null : t.employee
    const rateRaw = emp?.hourly_rate
    const rate = rateRaw == null ? null : Number(rateRaw)
    const has_rate = rate != null && Number.isFinite(rate) && rate > 0
    const hours = Number(t.hours ?? 0)
    return {
      id: t.id,
      date: (t.start_time ?? '').slice(0, 10),
      employee_id: t.employee_id,
      employee_name: emp?.name ?? null,
      work_order_id: t.work_order_id,
      hours,
      hourly_rate: has_rate ? (rate as number) : null,
      total_sales_price: has_rate ? Math.round(hours * (rate as number) * 100) / 100 : 0,
      billable: !!t.billable,
      description: t.description,
      has_rate,
    }
  })

  // ---- Map materials ----
  const matRows = (materialsRes.data ?? []) as Array<{
    id: string
    description: string
    quantity: number | string
    unit: string
    unit_sales_price: number | string
    total_sales_price: number | string
    supplier_name_snapshot: string | null
    source: string
  }>
  const materials: UnbilledMaterialRow[] = matRows.map((m) => {
    const sale = Number(m.unit_sales_price)
    return {
      id: m.id,
      description: m.description,
      quantity: Number(m.quantity),
      unit: m.unit,
      unit_sales_price: sale,
      total_sales_price: Number(m.total_sales_price),
      has_sale_price: Number.isFinite(sale) && sale > 0,
      supplier_name: m.supplier_name_snapshot,
      source: m.source,
    }
  })

  // ---- Map other costs ----
  const ocRows = (otherCostsRes.data ?? []) as Array<{
    id: string
    category: string
    description: string
    cost_date: string | null
    quantity: number | string
    unit: string
    unit_sales_price: number | string
    total_sales_price: number | string
    supplier_name: string | null
    source: string
  }>
  const other_costs: UnbilledOtherCostRow[] = ocRows.map((o) => {
    const sale = Number(o.unit_sales_price)
    return {
      id: o.id,
      category: o.category,
      description: o.description,
      cost_date: o.cost_date,
      quantity: Number(o.quantity),
      unit: o.unit,
      unit_sales_price: sale,
      total_sales_price: Number(o.total_sales_price),
      has_sale_price: Number.isFinite(sale) && sale > 0,
      supplier_name: o.supplier_name,
      source: o.source,
    }
  })

  return {
    ok: true,
    data: {
      case_id: sag.id as string,
      case_number: (sag as { case_number: string | null }).case_number,
      customer_id: sag.customer_id as string | null,
      customer_name,
      time_logs,
      materials,
      other_costs,
    },
  }
}

// =====================================================
// 6B-2 — createInvoiceDraftFromCase
// =====================================================


export async function createInvoiceDraftFromCaseAction(
  caseId: string,
  selection: CaseInvoiceSelection,
  options: CaseInvoiceOptions = {}
): Promise<CreateInvoiceDraftResult> {
  try {
    validateUUID(caseId, 'case_id')
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Ugyldigt case_id',
      invoice_id: null,
      invoice_number: null,
      created_lines: [],
      skipped_lines: [],
      totals: null,
    }
  }
  let approverId: string
  let supabase
  try {
    const a = await getAuthenticatedClient()
    approverId = a.userId
    supabase = a.supabase
  } catch (err) {
    return {
      ok: false,
      message: formatError(err, 'Adgang nægtet'),
      invoice_id: null,
      invoice_number: null,
      created_lines: [],
      skipped_lines: [],
      totals: null,
    }
  }

  const result = await createInvoiceDraftFromCaseService(
    caseId,
    approverId,
    selection,
    options
  )

  if (result.ok && result.invoice_id) {
    revalidatePath('/dashboard/invoices')
    revalidatePath(`/dashboard/invoices/${result.invoice_id}`)
    // Resolve case_number for the canonical orders detail revalidate
    const { data: caseRow } = await supabase
      .from('service_cases')
      .select('case_number')
      .eq('id', caseId)
      .maybeSingle()
    if (caseRow?.case_number) {
      revalidatePath(`/dashboard/orders/${caseRow.case_number}`)
    }
    revalidatePath(`/dashboard/orders/${caseId}`)
  }

  return result
}
