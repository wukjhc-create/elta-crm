'use server'

/**
 * Sprint 6B-2 + 6B-3 — server actions for outgoing invoices.
 */

import { revalidatePath } from 'next/cache'
import {
  getAuthenticatedClientWithRole,
  formatError,
} from '@/lib/actions/action-helpers'
import {
  createInvoiceDraftFromCase as createInvoiceDraftFromCaseService,
  type CaseInvoiceSelection,
  type CaseInvoiceOptions,
  type CreateInvoiceDraftResult,
} from '@/lib/services/invoice-from-case'
import {
  deleteInvoiceDraft,
  markInvoicePaid as markInvoicePaidService,
  markInvoiceSent as markInvoiceSentService,
  sendInvoiceEmail as sendInvoiceEmailService,
} from '@/lib/services/invoices'
import {
  createFinalInvoiceForCase,
  createStageInvoiceForCase,
  listStageInvoicesForCase,
  type CreateFinalInvoiceInput,
  type CreateFinalInvoiceResult,
  type CreateStageInvoiceInput,
  type CreateStageInvoiceResult,
  type StageInvoiceSummary,
} from '@/lib/services/invoice-stage'
import {
  createCreditNoteForInvoice,
  getCreditedAmountForInvoice,
  type CreateCreditNoteInput,
  type CreateCreditNoteResult,
  type CreditSummary,
} from '@/lib/services/invoice-credit'
import type { InvoiceLineRow, InvoiceRow } from '@/types/invoice.types'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'

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
  /** Sprint 6D-3 — needed for percent-based stage invoices */
  contract_sum: number | null
  revised_sum: number | null
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

  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('invoices.create')) {
    return { ok: false, message: 'Manglende tilladelse: invoices.create' }
  }

  // 1. Sag header
  const { data: sag, error: sagErr } = await supabase
    .from('service_cases')
    .select('id, case_number, customer_id, contract_sum, revised_sum, customer:customers!service_cases_customer_id_fkey(company_name, contact_person)')
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

  const sagAny = sag as unknown as {
    id: string
    case_number: string | null
    customer_id: string | null
    contract_sum: number | string | null
    revised_sum: number | string | null
  }

  return {
    ok: true,
    data: {
      case_id: sagAny.id,
      case_number: sagAny.case_number,
      customer_id: sagAny.customer_id,
      customer_name,
      contract_sum: sagAny.contract_sum == null ? null : Number(sagAny.contract_sum),
      revised_sum: sagAny.revised_sum == null ? null : Number(sagAny.revised_sum),
      time_logs,
      materials,
      other_costs,
    },
  }
}

// =====================================================
// 6B-4 — invoice detail + status actions
// =====================================================

export interface InvoiceDetail {
  invoice: InvoiceRow
  lines: InvoiceLineRow[]
  customer: {
    id: string
    name: string
    email: string | null
    address: string | null
    zip: string | null
    city: string | null
    cvr: string | null
  } | null
  case: {
    id: string
    case_number: string
    title: string | null
    project_name: string | null
  } | null
  /** Sprint 6D-4 — forgængere når is_final_invoice=true. */
  predecessors: Array<{
    invoice_id: string
    invoice_number: string
    invoice_type: 'standard' | 'deposit' | 'progress' | 'final' | 'credit'
    stage_label: string | null
    status: 'draft' | 'sent' | 'paid'
    deduction_amount: number
  }>
}

export type InvoiceActionOutcome = {
  ok: boolean
  message: string
}

export async function getInvoiceDetailAction(
  invoiceId: string
): Promise<InvoiceDetail | null> {
  try {
    validateUUID(invoiceId, 'id')
  } catch {
    return null
  }
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('invoices.view.all')) {
    return null
  }

  const { data: invRaw, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()
  if (error || !invRaw) return null
  const invoice = invRaw as InvoiceRow

  const [linesRes, customerRes, caseRes] = await Promise.all([
    supabase
      .from('invoice_lines')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('position', { ascending: true }),
    invoice.customer_id
      ? supabase
          .from('customers')
          .select('id, company_name, contact_person, billing_address, billing_postal_code, billing_city, vat_number, email')
          .eq('id', invoice.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    invoice.case_id
      ? supabase
          .from('service_cases')
          .select('id, case_number, title, project_name')
          .eq('id', invoice.case_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const cust = customerRes.data as
    | {
        id: string
        company_name: string | null
        contact_person: string | null
        billing_address: string | null
        billing_postal_code: string | null
        billing_city: string | null
        vat_number: string | null
        email: string | null
      }
    | null
  const customer = cust
    ? {
        id: cust.id,
        name: cust.company_name || cust.contact_person || '',
        email: cust.email,
        address: cust.billing_address,
        zip: cust.billing_postal_code,
        city: cust.billing_city,
        cvr: cust.vat_number,
      }
    : null

  const caseRow = caseRes.data as
    | { id: string; case_number: string; title: string | null; project_name: string | null }
    | null

  // Sprint 6D-4: predecessors for slutfaktura
  let predecessors: InvoiceDetail['predecessors'] = []
  if ((invoice as { is_final_invoice?: boolean }).is_final_invoice) {
    const { data: links } = await supabase
      .from('invoice_predecessors')
      .select('predecessor_invoice_id, deduction_amount')
      .eq('invoice_id', invoiceId)
    const ids = (links ?? []).map((l) => l.predecessor_invoice_id as string)
    if (ids.length > 0) {
      const { data: predRows } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_type, stage_label, status')
        .in('id', ids)
      type PR = {
        id: string
        invoice_number: string
        invoice_type: string
        stage_label: string | null
        status: string
      }
      const byId = new Map(((predRows ?? []) as PR[]).map((p) => [p.id, p]))
      for (const link of links ?? []) {
        const p = byId.get(link.predecessor_invoice_id as string)
        if (!p) continue
        predecessors.push({
          invoice_id: p.id,
          invoice_number: p.invoice_number,
          invoice_type: p.invoice_type as InvoiceDetail['predecessors'][number]['invoice_type'],
          stage_label: p.stage_label,
          status: p.status as InvoiceDetail['predecessors'][number]['status'],
          deduction_amount: Number(link.deduction_amount),
        })
      }
    }
  }

  return {
    invoice,
    lines: (linesRes.data ?? []) as InvoiceLineRow[],
    customer,
    case: caseRow,
    predecessors,
  }
}

export async function markInvoiceSentAction(
  invoiceId: string
): Promise<InvoiceActionOutcome> {
  try {
    validateUUID(invoiceId, 'id')
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ugyldigt id' }
  }
  const { hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('invoices.send')) {
    return { ok: false, message: 'Manglende tilladelse: invoices.send' }
  }
  try {
    await markInvoiceSentService(invoiceId)
  } catch (err) {
    return { ok: false, message: formatError(err, 'Kunne ikke markere som sendt') }
  }
  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  return { ok: true, message: 'Markeret som sendt (ingen mail/PDF — kommer i Sprint 6C)' }
}

export async function markInvoicePaidAction(
  invoiceId: string,
  paymentReference?: string | null
): Promise<InvoiceActionOutcome> {
  try {
    validateUUID(invoiceId, 'id')
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ugyldigt id' }
  }
  const { hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('invoices.mark_paid')) {
    return { ok: false, message: 'Manglende tilladelse: invoices.mark_paid' }
  }
  try {
    await markInvoicePaidService(invoiceId, paymentReference ?? null)
  } catch (err) {
    return { ok: false, message: formatError(err, 'Kunne ikke markere som betalt') }
  }
  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  return { ok: true, message: 'Markeret som betalt' }
}

export async function sendInvoiceEmailAction(
  invoiceId: string
): Promise<InvoiceActionOutcome> {
  try {
    validateUUID(invoiceId, 'id')
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ugyldigt id' }
  }
  const { hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('invoices.send')) {
    return { ok: false, message: 'Manglende tilladelse: invoices.send' }
  }
  const r = await sendInvoiceEmailService(invoiceId)
  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  if (r.status === 'sent') {
    return { ok: true, message: `Faktura sendt til ${r.recipient}` }
  }
  if (r.status === 'already_sent') {
    return { ok: false, message: `Allerede sendt — ${r.reason ?? 'status er ikke draft'}` }
  }
  if (r.status === 'skipped') {
    return { ok: false, message: `Sprunget over — ${r.reason ?? 'kunne ikke sende'}` }
  }
  return { ok: false, message: `Mail-send fejlede: ${r.error ?? 'ukendt fejl'}` }
}

export async function deleteInvoiceDraftAction(
  invoiceId: string
): Promise<InvoiceActionOutcome> {
  try {
    validateUUID(invoiceId, 'id')
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ugyldigt id' }
  }
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('invoices.delete_draft')) {
    return { ok: false, message: 'Manglende tilladelse: invoices.delete_draft' }
  }

  // Resolve case_number ahead of delete so we can revalidate the
  // sag's order page (where the Fakturakladde-tab lives) AFTER the
  // delete frees the source-row locks.
  const { data: inv } = await supabase
    .from('invoices')
    .select('case_id')
    .eq('id', invoiceId)
    .maybeSingle()

  let caseNumber: string | null = null
  if (inv?.case_id) {
    const { data: caseRow } = await supabase
      .from('service_cases')
      .select('case_number')
      .eq('id', inv.case_id)
      .maybeSingle()
    caseNumber = (caseRow?.case_number as string | null) ?? null
  }

  let summary: Awaited<ReturnType<typeof deleteInvoiceDraft>>
  try {
    summary = await deleteInvoiceDraft(invoiceId)
  } catch (err) {
    return { ok: false, message: formatError(err, 'Kunne ikke slette kladden') }
  }

  // Sprint Ø3.3 — persistent audit i audit_logs (kladde slettet + kilderækker
  // låst op). Best-effort: en audit-fejl må aldrig vælte sletningen.
  try {
    const unlockedTotal =
      summary.unlocked_time_logs + summary.unlocked_materials + summary.unlocked_other
    const isCredit = summary.invoice_type === 'credit'
    await supabase.from('audit_logs').insert({
      user_id: userId,
      entity_type: 'invoice',
      entity_id: invoiceId,
      entity_name: summary.invoice_number,
      action: isCredit ? 'credit_draft_deleted' : 'invoice_draft_deleted',
      action_description: `${isCredit ? 'Kreditnota-kladde' : 'Fakturakladde'} ${summary.invoice_number} slettet — ${unlockedTotal} kilderække(r) låst op (${summary.unlocked_time_logs} timer, ${summary.unlocked_materials} materialer, ${summary.unlocked_other} øvrige)`,
      changes: {
        unlocked_time_logs: summary.unlocked_time_logs,
        unlocked_materials: summary.unlocked_materials,
        unlocked_other: summary.unlocked_other,
        line_count: unlockedTotal,
      },
      metadata: {
        case_id: summary.case_id,
        case_number: caseNumber,
        invoice_type: summary.invoice_type,
        final_amount: summary.final_amount,
        unlocked: true,
      },
    })
  } catch (auditErr) {
    logger.error('deleteDraftInvoiceAction: audit insert failed', {
      entityId: invoiceId,
      error: auditErr,
    })
  }

  revalidatePath('/dashboard/invoices')
  revalidatePath(`/dashboard/invoices/${invoiceId}`)
  if (inv?.case_id) {
    revalidatePath(`/dashboard/orders/${inv.case_id}`)
  }
  if (caseNumber) {
    revalidatePath(`/dashboard/orders/${caseNumber}`)
  }
  return { ok: true, message: 'Kladde slettet — kilderækker er igen ufakturerede' }
}

// =====================================================
// 6F-2 — Credit-note actions
// =====================================================

export async function getCreditedAmountForInvoiceAction(
  invoiceId: string
): Promise<CreditSummary> {
  const empty: CreditSummary = {
    ok: false,
    original_invoice_id: null,
    original_invoice_number: null,
    original_total_ex_vat: 0,
    original_vat: 0,
    original_total_incl_vat: 0,
    existing_credit_notes: [],
    credited_ex_vat_total: 0,
    credited_vat_total: 0,
    credited_incl_vat_total: 0,
    credited_finalized_ex_vat_total: 0,
    credited_finalized_vat_total: 0,
    credited_finalized_incl_vat_total: 0,
    credited_draft_ex_vat_total: 0,
    credited_draft_vat_total: 0,
    credited_draft_incl_vat_total: 0,
    finalized_credit_count: 0,
    draft_credit_count: 0,
    remaining_creditable_ex_vat: 0,
    remaining_creditable_incl_vat: 0,
    is_voided: false,
    voided_at: null,
    has_only_draft_credits: false,
    is_fully_credited_finalized: false,
  }
  try {
    validateUUID(invoiceId, 'invoice_id')
  } catch (err) {
    return { ...empty, message: err instanceof Error ? err.message : 'Ugyldigt id' }
  }
  const { hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('invoices.view.all')) {
    return { ...empty, message: 'Manglende tilladelse: invoices.view.all' }
  }
  return getCreditedAmountForInvoice(invoiceId)
}

export async function createCreditNoteForInvoiceAction(
  input: CreateCreditNoteInput
): Promise<CreateCreditNoteResult> {
  const empty: CreateCreditNoteResult = {
    ok: false,
    message: '',
    credit_invoice_id: null,
    credit_invoice_number: null,
    credited_ex_vat: 0,
    credited_vat: 0,
    credited_incl_vat: 0,
    voided_original: false,
    remaining_after_creditable_ex_vat: 0,
  }
  try {
    validateUUID(input.invoice_id, 'invoice_id')
  } catch (err) {
    return { ...empty, message: err instanceof Error ? err.message : 'Ugyldigt id' }
  }
  const { userId, supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('invoices.credit')) {
    return { ...empty, message: 'Manglende tilladelse: invoices.credit' }
  }
  const result = await createCreditNoteForInvoice(input, userId)
  if (result.ok && result.credit_invoice_id) {
    revalidatePath('/dashboard/invoices')
    revalidatePath(`/dashboard/invoices/${input.invoice_id}`)
    revalidatePath(`/dashboard/invoices/${result.credit_invoice_id}`)
    // Resolve sagens case_id + case_number for orders revalidate + audit
    const { data: orig } = await supabase
      .from('invoices')
      .select('case_id, invoice_number')
      .eq('id', input.invoice_id)
      .maybeSingle()
    let creditCaseNumber: string | null = null
    if (orig?.case_id) {
      const { data: c } = await supabase
        .from('service_cases')
        .select('case_number')
        .eq('id', orig.case_id)
        .maybeSingle()
      creditCaseNumber = (c?.case_number as string | null) ?? null
      if (creditCaseNumber) revalidatePath(`/dashboard/orders/${creditCaseNumber}`)
      revalidatePath(`/dashboard/orders/${orig.case_id}`)
    }

    // Sprint Ø3.3 — persistent audit i audit_logs (kreditnota oprettet).
    // Best-effort: audit-fejl må aldrig vælte krediteringen.
    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        entity_type: 'invoice',
        entity_id: result.credit_invoice_id,
        entity_name: result.credit_invoice_number,
        action: 'invoice_credited',
        action_description: `Kreditnota ${result.credit_invoice_number ?? ''} oprettet for faktura ${(orig?.invoice_number as string | null) ?? input.invoice_id} — ${(result.credited_incl_vat ?? 0).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr (inkl. moms)${result.voided_original ? ' — original markeret som krediteret' : ''}`,
        changes: {
          credited_incl_vat: result.credited_incl_vat ?? 0,
          voided_original: result.voided_original ?? false,
        },
        metadata: {
          case_id: (orig?.case_id as string | null) ?? null,
          case_number: creditCaseNumber,
          invoice_type: 'credit',
          original_invoice_id: input.invoice_id,
          original_invoice_number: (orig?.invoice_number as string | null) ?? null,
          final_amount: result.credited_incl_vat ?? 0,
        },
      })
    } catch (auditErr) {
      logger.error('createCreditNoteForInvoiceAction: audit insert failed', {
        entityId: result.credit_invoice_id,
        error: auditErr,
      })
    }
  }
  return result
}

// =====================================================
// 6D-2 — Multi-stage invoice actions (deposit / progress / final)
// =====================================================

async function revalidateForCase(supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase'], caseId: string) {
  const { data: c } = await supabase
    .from('service_cases')
    .select('case_number')
    .eq('id', caseId)
    .maybeSingle()
  if (c?.case_number) {
    revalidatePath(`/dashboard/orders/${c.case_number}`)
  }
  revalidatePath(`/dashboard/orders/${caseId}`)
}

export async function createStageInvoiceAction(
  input: CreateStageInvoiceInput
): Promise<CreateStageInvoiceResult> {
  const empty: CreateStageInvoiceResult = {
    ok: false,
    message: '',
    invoice_id: null,
    invoice_number: null,
    total_amount: null,
    tax_amount: null,
    final_amount: null,
    cumulative_percentage_after: null,
  }
  try {
    validateUUID(input.case_id, 'case_id')
  } catch (err) {
    return { ...empty, message: err instanceof Error ? err.message : 'Ugyldigt case_id' }
  }
  const { userId, supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('invoices.create')) {
    return { ...empty, message: 'Manglende tilladelse: invoices.create' }
  }
  const result = await createStageInvoiceForCase(input, userId)
  if (result.ok && result.invoice_id) {
    revalidatePath('/dashboard/invoices')
    revalidatePath(`/dashboard/invoices/${result.invoice_id}`)
    await revalidateForCase(supabase, input.case_id)
  }
  return result
}

export async function createFinalInvoiceAction(
  input: CreateFinalInvoiceInput
): Promise<CreateFinalInvoiceResult> {
  const empty: CreateFinalInvoiceResult = {
    ok: false,
    message: '',
    invoice_id: null,
    invoice_number: null,
    predecessor_count: 0,
    deduction_total: 0,
    unbilled_lines_count: 0,
    total_amount: null,
    tax_amount: null,
    final_amount: null,
  }
  try {
    validateUUID(input.case_id, 'case_id')
  } catch (err) {
    return { ...empty, message: err instanceof Error ? err.message : 'Ugyldigt case_id' }
  }
  const { userId, supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('invoices.create')) {
    return { ...empty, message: 'Manglende tilladelse: invoices.create' }
  }
  const result = await createFinalInvoiceForCase(input, userId)
  if (result.ok && result.invoice_id) {
    revalidatePath('/dashboard/invoices')
    revalidatePath(`/dashboard/invoices/${result.invoice_id}`)
    await revalidateForCase(supabase, input.case_id)
  }
  return result
}

export async function listStageInvoicesForCaseAction(
  caseId: string
): Promise<{ ok: boolean; message?: string; data?: StageInvoiceSummary[] }> {
  try {
    validateUUID(caseId, 'case_id')
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ugyldigt case_id' }
  }
  const { hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('invoices.view.all')) {
    return { ok: false, message: 'Manglende tilladelse: invoices.view.all' }
  }
  return listStageInvoicesForCase(caseId)
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
    const a = await getAuthenticatedClientWithRole()
    if (!a.hasPermission('invoices.create')) {
      return {
        ok: false,
        message: 'Manglende tilladelse: invoices.create',
        invoice_id: null,
        invoice_number: null,
        created_lines: [],
        skipped_lines: [],
        totals: null,
      }
    }
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

// =====================================================
// Sprint Ø3.3 — Cost-free fakturahistorik på sagen
//
// Læser persistente audit_logs (entity_type='invoice') hvor
// metadata.case_id matcher sagen, og returnerer en omkostningsfri
// tidslinje: dato/tid, handling, bruger, fakturanr, antal linjer,
// beløb (salg inkl. moms — ALDRIG kost), type. Gated på
// invoices.view.own_cases (IKKE economy.cost_prices).
// =====================================================

export type CaseInvoiceHistoryAction =
  | 'invoice_created_from_case'
  | 'stage_invoice_created_from_case'
  | 'final_invoice_created_from_case'
  | 'invoice_draft_deleted'
  | 'credit_draft_deleted'
  | 'invoice_credited'

export interface CaseInvoiceHistoryEntry {
  id: string
  created_at: string
  action: string
  action_label: string
  action_description: string | null
  user_name: string
  invoice_number: string | null
  invoice_type: string | null
  line_count: number | null
  amount_incl_vat: number | null
  is_unlock: boolean
  is_credit: boolean
}

export interface CaseInvoiceHistoryResult {
  ok: boolean
  message?: string
  entries: CaseInvoiceHistoryEntry[]
}

const CASE_INVOICE_HISTORY_LABELS: Record<string, string> = {
  invoice_created_from_case: 'Faktura oprettet',
  stage_invoice_created_from_case: 'Rate-/forskudsfaktura oprettet',
  final_invoice_created_from_case: 'Slutfaktura oprettet',
  invoice_draft_deleted: 'Fakturakladde slettet',
  credit_draft_deleted: 'Kreditnota-kladde slettet',
  invoice_credited: 'Kreditnota oprettet',
}

const CASE_INVOICE_HISTORY_ACTIONS = Object.keys(CASE_INVOICE_HISTORY_LABELS)

export async function getCaseInvoiceHistoryAction(
  caseId: string
): Promise<CaseInvoiceHistoryResult> {
  try {
    validateUUID(caseId, 'case_id')
  } catch (err) {
    return {
      ok: false,
      entries: [],
      message: err instanceof Error ? err.message : 'Ugyldigt case_id',
    }
  }

  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('invoices.view.own_cases')) {
    return { ok: false, entries: [], message: 'Manglende tilladelse: invoices.view.own_cases' }
  }

  // entity_type='invoice' + metadata @> { case_id } — jsonb containment.
  const { data: rows, error } = await supabase
    .from('audit_logs')
    .select(
      'id, created_at, action, action_description, entity_name, user_id, user_name, user_email, changes, metadata'
    )
    .eq('entity_type', 'invoice')
    .in('action', CASE_INVOICE_HISTORY_ACTIONS)
    .contains('metadata', { case_id: caseId })
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('getCaseInvoiceHistoryAction: query failed', { entityId: caseId, error })
    return { ok: false, entries: [], message: 'Kunne ikke hente fakturahistorik' }
  }

  const list = rows ?? []

  // Berig brugernavne via separat profiles-opslag (profiles har ingen FK
  // til auth.users — derfor ikke PostgREST-join). Falder tilbage til
  // audit-rækkens egne user_name/user_email, ellers "Ukendt bruger".
  const userIds = Array.from(
    new Set(list.map((r) => r.user_id as string | null).filter(Boolean) as string[])
  )
  const profileById = new Map<string, { full_name: string | null; email: string | null }>()
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds)
    for (const p of profs ?? []) {
      profileById.set(p.id as string, {
        full_name: (p.full_name as string | null) ?? null,
        email: (p.email as string | null) ?? null,
      })
    }
  }

  const entries: CaseInvoiceHistoryEntry[] = list.map((r) => {
    const changes = (r.changes ?? {}) as Record<string, unknown>
    const metadata = (r.metadata ?? {}) as Record<string, unknown>
    const prof = r.user_id ? profileById.get(r.user_id as string) : undefined
    const userName =
      prof?.full_name ||
      prof?.email ||
      (r.user_name as string | null) ||
      (r.user_email as string | null) ||
      'Ukendt bruger'

    const lineCount =
      typeof changes.line_count === 'number' ? (changes.line_count as number) : null
    const amount =
      typeof metadata.final_amount === 'number'
        ? (metadata.final_amount as number)
        : typeof metadata.final === 'number'
          ? (metadata.final as number)
          : null
    const action = r.action as string

    return {
      id: r.id as string,
      created_at: r.created_at as string,
      action,
      action_label: CASE_INVOICE_HISTORY_LABELS[action] ?? action,
      action_description: (r.action_description as string | null) ?? null,
      user_name: userName,
      invoice_number: (r.entity_name as string | null) ?? null,
      invoice_type: (metadata.invoice_type as string | null) ?? null,
      line_count: lineCount,
      amount_incl_vat: amount,
      is_unlock: metadata.unlocked === true,
      is_credit: action === 'invoice_credited' || action === 'credit_draft_deleted',
    }
  })

  return { ok: true, entries }
}
