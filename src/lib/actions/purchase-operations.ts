'use server'

/**
 * Sprint Ø9.5 + Ø9.6 — Porteføljevidt indkøbs-drift.
 *
 * Ø9.5: dashboard-widget-overblik (getPurchaseOperationsDashboardAction).
 * Ø9.6: fuld driftsside med filtre + server-side pagination
 *       (getPurchaseOperationsPageAction).
 *
 * GENBRUGTE REGLER (ingen nye parallelle regler):
 *   • Ukonverteret linje (Ø9.4 / getServiceCaseEconomy): en linje er HÅNDTERET
 *     hvis converted_case_material_id ELLER converted_case_other_cost_id er sat,
 *     ELLER converted_at er sat (eksplicit skip). Alt andet = ukonverteret.
 *   • Forfald (Ø9.1): incomingDueBadge(due_date, today) → 'overdue' | 'due_soon'
 *     (≤7 dage) — fra @/lib/invoices/incoming-invoice-due.
 *   • rejected/cancelled-fakturaer ekskluderes helt (døde).
 *   • approved/posted med ukonverterede linjer = driftproblem (action_required).
 *   • received/awaiting_approval tælles SEPARAT — aldrig blandet ind i drift.
 *   • Forfald (overdue/due_soon) regnes kun for betalingsforpligtende fakturaer
 *     (status approved/posted).
 *
 * PERFORMANCE: ét bounded scan-query (incoming_invoices + nested lines/supplier)
 * + ét IN-query for sags-metadata. Ingen N+1, ingen query pr. sag. Filtrering/
 * sortering/pagination sker in-memory på det bounded scan (cap = INVOICE_SCAN_CAP)
 * → truncated-flag når cap nås.
 *
 * SECURITY: read-only. incoming_invoices.view kræves; interne beløb kun bag
 * economy.cost_prices. Ingen storage-URL/file_url/raw_text, ingen portal/anon,
 * ingen e-conomic-push, ingen auto-konvertering, ingen salg/margin/DB.
 */

import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { formatError } from '@/lib/actions/action-helpers'
import { incomingDueBadge } from '@/lib/invoices/incoming-invoice-due'

const r2 = (n: number) => Math.round(n * 100) / 100

// Bounded scan. Realistisk porteføljevolumen er langt under dette; cap'et er en
// sikkerhedsventil mod runaway-payload. Hit → truncated=true (amber UI-note).
const INVOICE_SCAN_CAP = 3000
const TOP_CASES_CAP = 20            // dashboard-widget
const SUPPLIER_OPTIONS_CAP = 100
const PAGE_SIZE_DEFAULT = 25
const PAGE_SIZE_MIN = 5
const PAGE_SIZE_MAX = 100
const SEARCH_MAX_LEN = 120

const DEAD_STATUSES = new Set(['rejected', 'cancelled'])
const PAYMENT_STATUSES = new Set(['approved', 'posted']) // betalingsforpligtende
const SCAN_STATUSES = ['approved', 'posted', 'received', 'awaiting_approval']

export type PurchaseOpsActionReason =
  | 'approved_unconverted'
  | 'posted_unconverted'
  | 'overdue'
  | 'due_soon'

export type PurchaseOpsReasonFilter =
  | 'all'
  | 'action_required'
  | 'approved_unconverted'
  | 'posted_unconverted'
  | 'overdue'
  | 'due_soon'
  | 'received_awaiting_unconverted'

export type PurchaseOpsSort = 'priority' | 'amount' | 'due_date' | 'newest_invoice'

export interface PurchaseOpsCaseRow {
  case_id: string
  case_number: string | null
  case_title: string | null
  customer_label: string | null
  unconverted_line_count: number
  /** Intern kost — null uden economy.cost_prices. */
  unconverted_amount: number | null
  overdue_count: number
  due_soon_count: number
  /** Ukonverterede linjer på received/awaiting-fakturaer — separat fra drift. */
  received_awaiting_count: number
  latest_invoice_date: string | null
  latest_due_date: string | null
  /** Tidligste forfaldsdato blandt betalingsfakturaer (til due_date-sortering). */
  earliest_due_date: string | null
  action_reasons: PurchaseOpsActionReason[]
  supplier_names: string[]
  case_link: string
  /** Mest presserende faktura på sagen (direkte "Åbn faktura"). */
  top_invoice_id: string | null
  top_invoice_link: string | null
}

export interface PurchaseOpsSummary {
  total_cases_with_action: number
  total_unconverted_lines: number
  /** Intern kost — null uden economy.cost_prices. */
  total_unconverted_amount: number | null
  overdue_invoice_count: number
  due_soon_invoice_count: number
  /** Antal approved/posted fakturaer med ukonverterede linjer (driftproblem). */
  approved_with_unconverted_count: number
  /** Antal received/awaiting fakturaer med ukonverterede linjer — IKKE drift. */
  received_awaiting_unconverted_count: number
}

interface CaseAccumulator {
  case_id: string
  unconverted_line_count: number
  unconverted_amount: number
  overdue_count: number
  due_soon_count: number
  received_awaiting_count: number
  approved_unconverted: boolean
  posted_unconverted: boolean
  latest_invoice_date: string | null
  latest_due_date: string | null
  earliest_due_date: string | null
  suppliers: Set<string>
  invoiceNumbers: Set<string>
  top_invoice_id: string | null
  top_invoice_rank: number // 3=overdue,2=due_soon,1=andet
  top_invoice_date: string | null
}

interface ScanResult {
  rows: PurchaseOpsCaseRow[]   // ALLE kandidat-sager (drift, forfald ELLER received-awaiting)
  summary: PurchaseOpsSummary
  supplierOptions: string[]
  currency: string
  truncated: boolean
  canViewAmounts: boolean
}

/** En sag kræver drifts-handling (drift ELLER forfald) — bruges til summary + filtre. */
function isActionableRow(r: PurchaseOpsCaseRow): boolean {
  return r.action_reasons.length > 0
}

/**
 * Fælles bounded scan + aggregering. Returnerer ALLE kandidat-sager (inkl.
 * received-awaiting-only) + global summary. Read-only, max to queries.
 */
async function scanPurchaseOps(): Promise<{ result?: ScanResult; error?: string; forbidden?: boolean; canViewAmounts: boolean }> {
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('incoming_invoices.view')) {
    return { forbidden: true, canViewAmounts: false }
  }
  const canViewAmounts = hasPermission('economy.cost_prices')
  const todayIso = new Date().toISOString().slice(0, 10)

  // --- Query 1: ikke-døde fakturaer matchet til en sag + linjer + leverandør ---
  const { data: invData, error: invErr } = await supabase
    .from('incoming_invoices')
    .select(`
      id, status, matched_case_id, invoice_number, invoice_date, due_date, currency,
      supplier_name_extracted,
      supplier:suppliers(name),
      lines:incoming_invoice_lines(
        total_price,
        converted_case_material_id,
        converted_case_other_cost_id,
        converted_at
      )
    `)
    .not('matched_case_id', 'is', null)
    .in('status', SCAN_STATUSES)
    .order('invoice_date', { ascending: false, nullsFirst: false })
    .limit(INVOICE_SCAN_CAP)

  if (invErr) return { error: invErr.message, canViewAmounts }

  type InvRow = {
    id: string; status: string; matched_case_id: string | null
    invoice_number: string | null; invoice_date: string | null; due_date: string | null; currency: string | null
    supplier_name_extracted: string | null
    supplier: { name: string | null } | { name: string | null }[] | null
    lines: Array<{ total_price: number | string | null; converted_case_material_id: string | null; converted_case_other_cost_id: string | null; converted_at: string | null }> | null
  }
  const invRows = (invData ?? []) as InvRow[]
  const truncated = invRows.length >= INVOICE_SCAN_CAP

  const cases = new Map<string, CaseAccumulator>()
  let currency = 'DKK'
  let totalUnconvertedLines = 0
  let totalUnconvertedAmount = 0
  let overdueInvoiceCount = 0
  let dueSoonInvoiceCount = 0
  let approvedWithUnconverted = 0
  let receivedAwaitingUnconverted = 0

  for (const inv of invRows) {
    if (!inv.matched_case_id) continue
    if (DEAD_STATUSES.has(inv.status)) continue
    if (inv.currency) currency = inv.currency

    const lines = Array.isArray(inv.lines) ? inv.lines : []
    let unconvLines = 0
    let unconvAmount = 0
    for (const ln of lines) {
      const handled =
        !!ln.converted_case_material_id ||
        !!ln.converted_case_other_cost_id ||
        !!ln.converted_at
      if (!handled) { unconvLines += 1; unconvAmount += Number(ln.total_price ?? 0) }
    }

    const isPayment = PAYMENT_STATUSES.has(inv.status)
    const badge = isPayment ? incomingDueBadge(inv.due_date, todayIso) : 'ok'
    const isOverdue = badge === 'overdue'
    const isDueSoon = badge === 'due_soon'

    // Kandidat hvis ukonverterede linjer ELLER forfalden/snart-forfalden betaling.
    if (unconvLines === 0 && !isOverdue && !isDueSoon) continue

    let acc = cases.get(inv.matched_case_id)
    if (!acc) {
      acc = {
        case_id: inv.matched_case_id, unconverted_line_count: 0, unconverted_amount: 0,
        overdue_count: 0, due_soon_count: 0, received_awaiting_count: 0,
        approved_unconverted: false, posted_unconverted: false,
        latest_invoice_date: null, latest_due_date: null, earliest_due_date: null,
        suppliers: new Set(), invoiceNumbers: new Set(),
        top_invoice_id: null, top_invoice_rank: 0, top_invoice_date: null,
      }
      cases.set(inv.matched_case_id, acc)
    }

    const supObj = Array.isArray(inv.supplier) ? inv.supplier[0] : inv.supplier
    const supplierName = supObj?.name ?? inv.supplier_name_extracted ?? null
    if (supplierName) acc.suppliers.add(supplierName)
    if (inv.invoice_number) acc.invoiceNumbers.add(inv.invoice_number)

    if (unconvLines > 0) {
      acc.unconverted_line_count += unconvLines
      acc.unconverted_amount += unconvAmount
      totalUnconvertedLines += unconvLines
      totalUnconvertedAmount += unconvAmount
      if (inv.status === 'approved') { acc.approved_unconverted = true; approvedWithUnconverted += 1 }
      else if (inv.status === 'posted') { acc.posted_unconverted = true; approvedWithUnconverted += 1 }
      else { acc.received_awaiting_count += 1; receivedAwaitingUnconverted += 1 } // received/awaiting — separat
    }
    if (isOverdue) { acc.overdue_count += 1; overdueInvoiceCount += 1 }
    if (isDueSoon) { acc.due_soon_count += 1; dueSoonInvoiceCount += 1 }

    if ((inv.invoice_date ?? '') > (acc.latest_invoice_date ?? '')) acc.latest_invoice_date = inv.invoice_date
    if ((inv.due_date ?? '') > (acc.latest_due_date ?? '')) acc.latest_due_date = inv.due_date
    // earliest due blandt betalingsfakturaer med dato (til due_date-sortering)
    if (isPayment && inv.due_date) {
      if (acc.earliest_due_date == null || inv.due_date < acc.earliest_due_date) acc.earliest_due_date = inv.due_date
    }

    const rank = isOverdue ? 3 : isDueSoon ? 2 : 1
    if (rank > acc.top_invoice_rank || (rank === acc.top_invoice_rank && (inv.invoice_date ?? '') > (acc.top_invoice_date ?? ''))) {
      acc.top_invoice_rank = rank
      acc.top_invoice_id = inv.id
      acc.top_invoice_date = inv.invoice_date
    }
  }

  // --- Query 2: sags-metadata for kandidat-sager (ét IN-query) ---
  const caseIds = Array.from(cases.keys())
  const caseMeta = new Map<string, { case_number: string | null; title: string | null; customer_label: string | null }>()
  if (caseIds.length > 0) {
    const { data: caseData } = await supabase
      .from('service_cases')
      .select('id, case_number, title, customer:customers!customer_id(company_name)')
      .in('id', caseIds)
    for (const c of (caseData ?? []) as Array<{ id: string; case_number: string | null; title: string | null; customer: { company_name: string | null } | { company_name: string | null }[] | null }>) {
      const cust = Array.isArray(c.customer) ? c.customer[0] : c.customer
      caseMeta.set(c.id, { case_number: c.case_number, title: c.title, customer_label: cust?.company_name ?? null })
    }
  }

  const supplierSet = new Set<string>()
  const rows: PurchaseOpsCaseRow[] = Array.from(cases.values()).map((c) => {
    const meta = caseMeta.get(c.case_id)
    const reasons: PurchaseOpsActionReason[] = []
    if (c.approved_unconverted) reasons.push('approved_unconverted')
    if (c.posted_unconverted) reasons.push('posted_unconverted')
    if (c.overdue_count > 0) reasons.push('overdue')
    if (c.due_soon_count > 0) reasons.push('due_soon')
    const suppliers = Array.from(c.suppliers)
    suppliers.forEach((s) => supplierSet.add(s))
    return {
      case_id: c.case_id,
      case_number: meta?.case_number ?? null,
      case_title: meta?.title ?? null,
      customer_label: meta?.customer_label ?? null,
      unconverted_line_count: c.unconverted_line_count,
      unconverted_amount: canViewAmounts ? r2(c.unconverted_amount) : null,
      overdue_count: c.overdue_count,
      due_soon_count: c.due_soon_count,
      received_awaiting_count: c.received_awaiting_count,
      latest_invoice_date: c.latest_invoice_date,
      latest_due_date: c.latest_due_date,
      earliest_due_date: c.earliest_due_date,
      action_reasons: reasons,
      supplier_names: suppliers,
      case_link: `/dashboard/orders/${c.case_id}`,
      top_invoice_id: c.top_invoice_id,
      top_invoice_link: c.top_invoice_id ? `/dashboard/incoming-invoices/${c.top_invoice_id}` : null,
    }
  })

  const summary: PurchaseOpsSummary = {
    total_cases_with_action: rows.filter(isActionableRow).length,
    total_unconverted_lines: totalUnconvertedLines,
    total_unconverted_amount: canViewAmounts ? r2(totalUnconvertedAmount) : null,
    overdue_invoice_count: overdueInvoiceCount,
    due_soon_invoice_count: dueSoonInvoiceCount,
    approved_with_unconverted_count: approvedWithUnconverted,
    received_awaiting_unconverted_count: receivedAwaitingUnconverted,
  }

  const supplierOptions = Array.from(supplierSet).sort((a, b) => a.localeCompare(b, 'da')).slice(0, SUPPLIER_OPTIONS_CAP)

  return { result: { rows, summary, supplierOptions, currency, truncated, canViewAmounts }, canViewAmounts }
}

// Prioritets-sortering (Ø9.5): drift → overdue → due_soon → beløb/linjer → nyeste.
function severity(r: PurchaseOpsCaseRow): number {
  return r.action_reasons.includes('approved_unconverted') || r.action_reasons.includes('posted_unconverted') ? 1 : 0
}
function sortByPriority(a: PurchaseOpsCaseRow, b: PurchaseOpsCaseRow): number {
  if (severity(a) !== severity(b)) return severity(b) - severity(a)
  if ((b.overdue_count > 0 ? 1 : 0) !== (a.overdue_count > 0 ? 1 : 0)) return (b.overdue_count > 0 ? 1 : 0) - (a.overdue_count > 0 ? 1 : 0)
  if ((b.due_soon_count > 0 ? 1 : 0) !== (a.due_soon_count > 0 ? 1 : 0)) return (b.due_soon_count > 0 ? 1 : 0) - (a.due_soon_count > 0 ? 1 : 0)
  const av = a.unconverted_amount ?? a.unconverted_line_count
  const bv = b.unconverted_amount ?? b.unconverted_line_count
  if (bv !== av) return bv - av
  return (b.latest_invoice_date ?? '').localeCompare(a.latest_invoice_date ?? '')
}

// =====================================================================
// Ø9.5 — Dashboard-widget-overblik (kompakt, top-20)
// =====================================================================

export interface PurchaseOperationsDashboard extends PurchaseOpsSummary {
  ok: boolean
  message?: string
  can_view_amounts: boolean
  top_cases: PurchaseOpsCaseRow[]
  currency: string
  truncated: boolean
  internal_purchase: true
}

export async function getPurchaseOperationsDashboardAction(): Promise<PurchaseOperationsDashboard> {
  const base: PurchaseOperationsDashboard = {
    ok: false, total_cases_with_action: 0, total_unconverted_lines: 0, total_unconverted_amount: null,
    overdue_invoice_count: 0, due_soon_invoice_count: 0, approved_with_unconverted_count: 0,
    received_awaiting_unconverted_count: 0, can_view_amounts: false, top_cases: [], currency: 'DKK',
    truncated: false, internal_purchase: true,
  }
  try {
    const { result, error, forbidden, canViewAmounts } = await scanPurchaseOps()
    if (forbidden) return { ...base, message: 'Manglende tilladelse: incoming_invoices.view' }
    if (error || !result) return { ...base, can_view_amounts: canViewAmounts, message: error ?? 'Ingen data' }

    const actionable = result.rows.filter(isActionableRow).sort(sortByPriority)
    return {
      ok: true,
      ...result.summary,
      can_view_amounts: result.canViewAmounts,
      top_cases: actionable.slice(0, TOP_CASES_CAP),
      currency: result.currency,
      truncated: result.truncated,
      internal_purchase: true,
    }
  } catch (e) {
    return { ...base, message: formatError(e, 'Kunne ikke hente indkøbsdrift-overblik') }
  }
}

// =====================================================================
// Ø9.6 — Fuld driftsside: filtre + server-side pagination
// =====================================================================

export interface PurchaseOpsPageParams {
  page?: number
  pageSize?: number
  reason?: PurchaseOpsReasonFilter
  search?: string
  supplier?: string
  sort?: PurchaseOpsSort
}

export interface PurchaseOperationsPage {
  ok: boolean
  message?: string
  items: PurchaseOpsCaseRow[]
  total_count: number
  page: number
  page_size: number
  total_pages: number
  reason: PurchaseOpsReasonFilter
  sort: PurchaseOpsSort
  summary: PurchaseOpsSummary
  supplier_options: string[]
  can_view_amounts: boolean
  currency: string
  truncated: boolean
  internal_purchase: true
}

const REASON_VALUES: PurchaseOpsReasonFilter[] = [
  'all', 'action_required', 'approved_unconverted', 'posted_unconverted', 'overdue', 'due_soon', 'received_awaiting_unconverted',
]
const SORT_VALUES: PurchaseOpsSort[] = ['priority', 'amount', 'due_date', 'newest_invoice']

function rowMatchesReason(r: PurchaseOpsCaseRow, reason: PurchaseOpsReasonFilter): boolean {
  switch (reason) {
    case 'all': return true
    case 'action_required': return isActionableRow(r)
    case 'approved_unconverted': return r.action_reasons.includes('approved_unconverted')
    case 'posted_unconverted': return r.action_reasons.includes('posted_unconverted')
    case 'overdue': return r.overdue_count > 0
    case 'due_soon': return r.due_soon_count > 0
    case 'received_awaiting_unconverted': return r.received_awaiting_count > 0
    default: return true
  }
}

export async function getPurchaseOperationsPageAction(params: PurchaseOpsPageParams = {}): Promise<PurchaseOperationsPage> {
  const emptySummary: PurchaseOpsSummary = {
    total_cases_with_action: 0, total_unconverted_lines: 0, total_unconverted_amount: null,
    overdue_invoice_count: 0, due_soon_invoice_count: 0, approved_with_unconverted_count: 0,
    received_awaiting_unconverted_count: 0,
  }
  // Normalisér/valider input (defense: clamp + whitelist).
  const reason: PurchaseOpsReasonFilter = REASON_VALUES.includes(params.reason as PurchaseOpsReasonFilter) ? (params.reason as PurchaseOpsReasonFilter) : 'all'
  const sort: PurchaseOpsSort = SORT_VALUES.includes(params.sort as PurchaseOpsSort) ? (params.sort as PurchaseOpsSort) : 'priority'
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(PAGE_SIZE_MIN, Math.floor(Number(params.pageSize) || PAGE_SIZE_DEFAULT)))
  let page = Math.max(1, Math.floor(Number(params.page) || 1))
  const search = (params.search ?? '').toString().trim().slice(0, SEARCH_MAX_LEN).toLowerCase()
  const searchTokens = search ? search.split(/\s+/).filter(Boolean) : []
  const supplierFilter = (params.supplier ?? '').toString().trim()

  const base: PurchaseOperationsPage = {
    ok: false, items: [], total_count: 0, page, page_size: pageSize, total_pages: 0,
    reason, sort, summary: emptySummary, supplier_options: [], can_view_amounts: false,
    currency: 'DKK', truncated: false, internal_purchase: true,
  }
  try {
    const { result, error, forbidden, canViewAmounts } = await scanPurchaseOps()
    if (forbidden) return { ...base, message: 'Manglende tilladelse: incoming_invoices.view' }
    if (error || !result) return { ...base, can_view_amounts: canViewAmounts, message: error ?? 'Ingen data' }

    // 1) Filtrér.
    let filtered = result.rows.filter((r) => rowMatchesReason(r, reason))
    if (supplierFilter) {
      const sf = supplierFilter.toLowerCase()
      filtered = filtered.filter((r) => r.supplier_names.some((s) => s.toLowerCase() === sf))
    }
    if (searchTokens.length > 0) {
      filtered = filtered.filter((r) => {
        const blob = [r.case_number, r.case_title, r.customer_label, ...r.supplier_names]
          .filter(Boolean).join(' ').toLowerCase()
        return searchTokens.every((t) => blob.includes(t))
      })
    }

    // 2) Sortér.
    if (sort === 'priority') filtered.sort(sortByPriority)
    else if (sort === 'amount') filtered.sort((a, b) => (b.unconverted_amount ?? b.unconverted_line_count) - (a.unconverted_amount ?? a.unconverted_line_count))
    else if (sort === 'newest_invoice') filtered.sort((a, b) => (b.latest_invoice_date ?? '').localeCompare(a.latest_invoice_date ?? ''))
    else if (sort === 'due_date') filtered.sort((a, b) => {
      // Mest presserende først: tidligste forfald (nulls sidst).
      const ad = a.earliest_due_date, bd = b.earliest_due_date
      if (ad && bd) return ad.localeCompare(bd)
      if (ad) return -1
      if (bd) return 1
      return 0
    })

    // 3) Paginér.
    const total_count = filtered.length
    const total_pages = Math.max(1, Math.ceil(total_count / pageSize))
    if (page > total_pages) page = total_pages
    const start = (page - 1) * pageSize
    const items = filtered.slice(start, start + pageSize)

    return {
      ok: true,
      items,
      total_count,
      page,
      page_size: pageSize,
      total_pages,
      reason,
      sort,
      summary: result.summary,
      supplier_options: result.supplierOptions,
      can_view_amounts: result.canViewAmounts,
      currency: result.currency,
      truncated: result.truncated,
      internal_purchase: true,
    }
  } catch (e) {
    return { ...base, message: formatError(e, 'Kunne ikke hente indkøbsdrift-side') }
  }
}
