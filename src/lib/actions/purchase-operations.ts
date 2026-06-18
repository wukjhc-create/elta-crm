'use server'

/**
 * Sprint Ø9.5 — Porteføljevidt indkøbs-drift-dashboard.
 *
 * Tværgående overblik for kontor/ledelse: hvilke sager har leverandørfaktura-
 * linjer der kræver handling, og hvor skal man trykke først.
 *
 * GENBRUGTE REGLER (ingen nye parallelle regler):
 *   • Ukonverteret linje (Ø9.4 / getServiceCaseEconomy): en linje er HÅNDTERET
 *     hvis converted_case_material_id ELLER converted_case_other_cost_id er sat,
 *     ELLER converted_at er sat (eksplicit skip). Alt andet = ukonverteret.
 *   • Forfald (Ø9.1): incomingDueBadge(due_date, today) → 'overdue' | 'due_soon'
 *     (≤7 dage) — fra @/lib/invoices/incoming-invoice-due.
 *   • rejected/cancelled-fakturaer ekskluderes helt (døde).
 *   • approved/posted med ukonverterede linjer = driftproblem (action_required),
 *     præcis samme betingelse som quality_flags.unconverted_supplier_invoice_lines.
 *   • received/awaiting_approval tælles SEPARAT — aldrig blandet ind i drift.
 *   • Forfald (overdue/due_soon) regnes kun for betalingsforpligtende fakturaer
 *     (status approved/posted), i tråd med Ø9.1-widgeten (som brugte 'approved').
 *
 * PERFORMANCE: præcis TO bounded queries (ingen N+1, ingen query pr. sag):
 *   1) incoming_invoices (matched_case_id ikke-null, ikke-død) + nested lines.
 *   2) service_cases hvor id IN (de fundne sager) + customer-label.
 * Faktura-cap (INVOICE_SCAN_CAP) markeres som truncated i payload + UI-note.
 *
 * SECURITY: read-only. incoming_invoices.view kræves; interne beløb kun bag
 * economy.cost_prices. Ingen storage-URL/file_url/raw_text, ingen portal/anon,
 * ingen e-conomic-push, ingen auto-konvertering, ingen salg/margin/DB.
 */

import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { formatError } from '@/lib/actions/action-helpers'
import { incomingDueBadge } from '@/lib/invoices/incoming-invoice-due'

const r2 = (n: number) => Math.round(n * 100) / 100

// Bounded scan. Realistisk porteføljevolumen pr. dag/uge er langt under dette;
// cap'et er en sikkerhedsventil mod runaway-payload. Hit → truncated=true.
const INVOICE_SCAN_CAP = 2000
const TOP_CASES_CAP = 20
const DEAD_STATUSES = new Set(['rejected', 'cancelled'])
const PAYMENT_STATUSES = new Set(['approved', 'posted']) // betalingsforpligtende
const ACTION_STATUSES = new Set(['approved', 'posted'])   // drift hvis ukonverteret

export type PurchaseOpsActionReason =
  | 'approved_unconverted'
  | 'posted_unconverted'
  | 'overdue'
  | 'due_soon'

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
  latest_invoice_date: string | null
  latest_due_date: string | null
  action_reasons: PurchaseOpsActionReason[]
  case_link: string
  /** Mest presserende faktura på sagen (direkte "Åbn faktura"). */
  top_invoice_id: string | null
  top_invoice_link: string | null
}

export interface PurchaseOperationsDashboard {
  ok: boolean
  message?: string
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
  can_view_amounts: boolean
  top_cases: PurchaseOpsCaseRow[]
  currency: string
  /** Faktura-cap ramt — tallene er et undersæt. */
  truncated: boolean
  internal_purchase: true
}

interface CaseAccumulator {
  case_id: string
  unconverted_line_count: number
  unconverted_amount: number
  overdue_count: number
  due_soon_count: number
  approved_unconverted: boolean
  posted_unconverted: boolean
  latest_invoice_date: string | null
  latest_due_date: string | null
  // mest presserende faktura: overdue > due_soon > nyeste
  top_invoice_id: string | null
  top_invoice_rank: number // 3=overdue,2=due_soon,1=andet
  top_invoice_date: string | null
}

export async function getPurchaseOperationsDashboardAction(): Promise<PurchaseOperationsDashboard> {
  const base: PurchaseOperationsDashboard = {
    ok: false, total_cases_with_action: 0, total_unconverted_lines: 0, total_unconverted_amount: null,
    overdue_invoice_count: 0, due_soon_invoice_count: 0, approved_with_unconverted_count: 0,
    received_awaiting_unconverted_count: 0, can_view_amounts: false, top_cases: [], currency: 'DKK',
    truncated: false, internal_purchase: true,
  }
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('incoming_invoices.view')) {
      return { ...base, message: 'Manglende tilladelse: incoming_invoices.view' }
    }
    const canViewAmounts = hasPermission('economy.cost_prices')
    const todayIso = new Date().toISOString().slice(0, 10)

    // --- Query 1: ikke-døde fakturaer matchet til en sag + linjer ---
    const { data: invData, error: invErr } = await supabase
      .from('incoming_invoices')
      .select(`
        id, status, matched_case_id, invoice_date, due_date, currency,
        lines:incoming_invoice_lines(
          total_price,
          converted_case_material_id,
          converted_case_other_cost_id,
          converted_at
        )
      `)
      .not('matched_case_id', 'is', null)
      .in('status', ['approved', 'posted', 'received', 'awaiting_approval'])
      .order('invoice_date', { ascending: false, nullsFirst: false })
      .limit(INVOICE_SCAN_CAP)

    if (invErr) return { ...base, can_view_amounts: canViewAmounts, message: invErr.message }

    type InvRow = {
      id: string; status: string; matched_case_id: string | null
      invoice_date: string | null; due_date: string | null; currency: string | null
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

      // En sag er først relevant hvis den enten har ukonverterede linjer
      // ELLER en forfalden/snart-forfalden betalingsfaktura.
      if (unconvLines === 0 && !isOverdue && !isDueSoon) continue

      let acc = cases.get(inv.matched_case_id)
      if (!acc) {
        acc = {
          case_id: inv.matched_case_id, unconverted_line_count: 0, unconverted_amount: 0,
          overdue_count: 0, due_soon_count: 0, approved_unconverted: false, posted_unconverted: false,
          latest_invoice_date: null, latest_due_date: null,
          top_invoice_id: null, top_invoice_rank: 0, top_invoice_date: null,
        }
        cases.set(inv.matched_case_id, acc)
      }

      if (unconvLines > 0) {
        acc.unconverted_line_count += unconvLines
        acc.unconverted_amount += unconvAmount
        totalUnconvertedLines += unconvLines
        totalUnconvertedAmount += unconvAmount
        if (inv.status === 'approved') { acc.approved_unconverted = true; approvedWithUnconverted += 1 }
        else if (inv.status === 'posted') { acc.posted_unconverted = true; approvedWithUnconverted += 1 }
        else { receivedAwaitingUnconverted += 1 } // received/awaiting — separat
      }
      if (isOverdue) { acc.overdue_count += 1; overdueInvoiceCount += 1 }
      if (isDueSoon) { acc.due_soon_count += 1; dueSoonInvoiceCount += 1 }

      // Nyeste datoer (string-sammenligning på YYYY-MM-DD er sikker).
      if ((inv.invoice_date ?? '') > (acc.latest_invoice_date ?? '')) acc.latest_invoice_date = inv.invoice_date
      if ((inv.due_date ?? '') > (acc.latest_due_date ?? '')) acc.latest_due_date = inv.due_date

      // Mest presserende faktura: overdue(3) > due_soon(2) > andet(1); tie → nyeste.
      const rank = isOverdue ? 3 : isDueSoon ? 2 : 1
      if (rank > acc.top_invoice_rank || (rank === acc.top_invoice_rank && (inv.invoice_date ?? '') > (acc.top_invoice_date ?? ''))) {
        acc.top_invoice_rank = rank
        acc.top_invoice_id = inv.id
        acc.top_invoice_date = inv.invoice_date
      }
    }

    // Kun sager der reelt kræver handling (drift ELLER forfald).
    const actionable = Array.from(cases.values()).filter(
      (c) => c.approved_unconverted || c.posted_unconverted || c.overdue_count > 0 || c.due_soon_count > 0
    )

    // --- Query 2: sags-metadata for de relevante sager (ét IN-query) ---
    const caseIds = actionable.map((c) => c.case_id)
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

    const top_cases: PurchaseOpsCaseRow[] = actionable.map((c) => {
      const meta = caseMeta.get(c.case_id)
      const reasons: PurchaseOpsActionReason[] = []
      if (c.approved_unconverted) reasons.push('approved_unconverted')
      if (c.posted_unconverted) reasons.push('posted_unconverted')
      if (c.overdue_count > 0) reasons.push('overdue')
      if (c.due_soon_count > 0) reasons.push('due_soon')
      return {
        case_id: c.case_id,
        case_number: meta?.case_number ?? null,
        case_title: meta?.title ?? null,
        customer_label: meta?.customer_label ?? null,
        unconverted_line_count: c.unconverted_line_count,
        unconverted_amount: canViewAmounts ? r2(c.unconverted_amount) : null,
        overdue_count: c.overdue_count,
        due_soon_count: c.due_soon_count,
        latest_invoice_date: c.latest_invoice_date,
        latest_due_date: c.latest_due_date,
        action_reasons: reasons,
        case_link: `/dashboard/orders/${c.case_id}`,
        top_invoice_id: c.top_invoice_id,
        top_invoice_link: c.top_invoice_id ? `/dashboard/incoming-invoices/${c.top_invoice_id}` : null,
      }
    })

    // Sortering: drift først, så overdue, så due_soon, så størst beløb/flest
    // linjer, så nyeste faktura.
    const severity = (r: PurchaseOpsCaseRow) =>
      (r.action_reasons.includes('approved_unconverted') || r.action_reasons.includes('posted_unconverted') ? 1 : 0)
    top_cases.sort((a, b) => {
      if (severity(a) !== severity(b)) return severity(b) - severity(a)
      if ((b.overdue_count > 0 ? 1 : 0) !== (a.overdue_count > 0 ? 1 : 0)) return (b.overdue_count > 0 ? 1 : 0) - (a.overdue_count > 0 ? 1 : 0)
      if ((b.due_soon_count > 0 ? 1 : 0) !== (a.due_soon_count > 0 ? 1 : 0)) return (b.due_soon_count > 0 ? 1 : 0) - (a.due_soon_count > 0 ? 1 : 0)
      const av = a.unconverted_amount ?? a.unconverted_line_count
      const bv = b.unconverted_amount ?? b.unconverted_line_count
      if (bv !== av) return bv - av
      return (b.latest_invoice_date ?? '').localeCompare(a.latest_invoice_date ?? '')
    })

    return {
      ok: true,
      total_cases_with_action: actionable.length,
      total_unconverted_lines: totalUnconvertedLines,
      total_unconverted_amount: canViewAmounts ? r2(totalUnconvertedAmount) : null,
      overdue_invoice_count: overdueInvoiceCount,
      due_soon_invoice_count: dueSoonInvoiceCount,
      approved_with_unconverted_count: approvedWithUnconverted,
      received_awaiting_unconverted_count: receivedAwaitingUnconverted,
      can_view_amounts: canViewAmounts,
      top_cases: top_cases.slice(0, TOP_CASES_CAP),
      currency,
      truncated,
      internal_purchase: true,
    }
  } catch (e) {
    return { ...base, message: formatError(e, 'Kunne ikke hente indkøbsdrift-overblik') }
  }
}
