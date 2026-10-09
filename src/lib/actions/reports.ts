'use server'

/**
 * Reports Server Actions
 *
 * Aggregation queries for the reports dashboard.
 * All data is scoped to the authenticated user's org.
 */

import { compareOfferToActual, type ActualMaterialInput, type OfferLineInput } from '@/lib/cases/offer-vs-actual'
import { profitabilityFigures, sumLabourCost } from '@/lib/cases/profitability-figures'
import { computeRealizedDb, type RealizedInvoiceInput } from '@/lib/cases/realized-db'
import type { ActionResult } from '@/types/common.types'
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { copenhagenParts, copenhagenLocalToIso } from '@/lib/utils/copenhagen-time'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { createAdminClient } from '@/lib/supabase/admin'
import { lastMonths } from '@/lib/reports/sales-funnel'
import {
  REJECTION_REASON_LABELS,
  type RejectionReasonCode,
} from '@/types/offers.types'

// =====================================================
// Types
// =====================================================

export interface RevenueByPeriod {
  period: string
  accepted_count: number
  accepted_revenue: number
  sent_count: number
  sent_value: number
}

export interface RevenueByCustomer {
  customer_id: string
  customer_name: string
  total_offers: number
  accepted_offers: number
  total_revenue: number
  acceptance_rate: number
}

export interface ProjectProfitability {
  project_id: string
  project_number: string
  project_name: string
  customer_name: string | null
  status: string
  budget: number | null
  actual_hours: number
  billable_hours: number
  estimated_hours: number | null
  /** N26d: tilbudt kost (tilbudslinjer) vs. faktisk kost (materialer + aggregeret timekost) — null uden tilbud/forbrug */
  offered_cost: number | null
  actual_cost: number | null
  cost_deviation: number | null
  /** N42: netto faktureret ekskl. moms og realiseret DB (faktisk kost inkl. øvrige omkostninger) */
  net_invoiced: number
  realized_db: number | null
  realized_db_pct: number | null
}

export interface TeamProductivity {
  user_id: string
  full_name: string
  total_hours: number
  billable_hours: number
  billable_percentage: number
  projects_count: number
}

// =====================================================
// Phase 12A — Rejection Analytics
// =====================================================

/**
 * Bucket-key for rejected offers uden kategorisk rejection_reason
 * (historiske pre-00121). Kan ikke eksporteres som value fra denne
 * 'use server'-fil — Next.js tillader kun async functions.
 */
export type RejectionReasonBucketKey = RejectionReasonCode | 'unknown'

export interface RejectionReasonStat {
  reason: RejectionReasonBucketKey
  label: string                  // dansk label ("Prisen er for høj" / "Ikke angivet")
  count: number
  lostRevenue: number
  percentage: number             // % af total afviste i scope
}

export interface RejectionStats {
  scopeDays: number              // hvor mange dage scope-vinduet daekker (90)
  totalRejected: number          // antal i scope (seneste 90 dage)
  rejectionRate: number          // % af alle decided offers (accepted + rejected) i scope
  lostRevenue: number            // sum(final_amount) for rejected i scope
  byReason: RejectionReasonStat[]
  trend: {
    last30Days: number
    prev30Days: number            // 60-30 dage tilbage
    deltaPercent: number          // (last30 - prev30) / prev30 * 100. + = flere afviste (vaerre)
  }
}

export interface RecentRejection {
  id: string
  offer_number: string
  title: string
  customer_name: string | null   // company_name eller contact_person fallback
  reason_code: RejectionReasonBucketKey
  reason_label: string
  rejected_at: string
  final_amount: number
  currency: string
}

export interface ReportsSummary {
  total_revenue: number
  pending_value: number
  acceptance_rate: number
  avg_offer_value: number
  active_projects: number
  total_hours_this_month: number
  billable_hours_this_month: number
  top_customer_name: string | null
  top_customer_revenue: number
}

// =====================================================
// Summary (parallelized)
// =====================================================

export async function getReportsSummary(): Promise<ActionResult<ReportsSummary>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('economy.view')) {
      return { success: false, error: 'Manglende tilladelse: economy.view' }
    }

    // rapport-review: dansk månedsstart (før serverens lokale tid = UTC)
    const monthStartIso = copenhagenLocalToIso(`${copenhagenParts(new Date()).date.slice(0, 7)}-01`, '00:00')

    // Execute all queries in parallel
    const [
      acceptedOffersResult,
      pendingOffersResult,
      acceptedCountResult,
      rejectedCountResult,
      allOffersResult,
      activeProjectsResult,
      monthEntriesResult,
      topCustomerResult,
    ] = await Promise.all([
      // Økonomi-review 2026-10-08: summer side for side (PostgREST giver højst 1.000 rækker)
      fetchAllRows<{ final_amount: number | null }>((from, to) => supabase.from('offers').select('id, final_amount').eq('status', 'accepted').eq('is_proposal', false).order('id').range(from, to))
        .then((data) => ({ data, error: null }), (e: Error) => ({ data: null, error: e })),
      fetchAllRows<{ final_amount: number | null }>((from, to) => supabase.from('offers').select('id, final_amount').in('status', ['sent', 'viewed']).eq('is_proposal', false).order('id').range(from, to))
        .then((data) => ({ data, error: null }), (e: Error) => ({ data: null, error: e })),
      supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'accepted').eq('is_proposal', false),
      supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'rejected').eq('is_proposal', false),
      fetchAllRows<{ final_amount: number | null }>((from, to) => supabase.from('offers').select('id, final_amount').not('status', 'eq', 'draft').eq('is_proposal', false).order('id').range(from, to))
        .then((data) => ({ data, error: null }), (e: Error) => ({ data: null, error: e })),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      // rapport-review: time_entries er den gamle model (≈ 0 i prod) — timer registreres i time_logs
      fetchAllRows<{ hours: number | string | null; billable: boolean | null }>((from, to) => supabase.from('time_logs')
        .select('id, hours, billable').not('end_time', 'is', null).neq('approval_status', 'rejected').gte('start_time', monthStartIso).order('id').range(from, to))
        .then((data) => ({ data, error: null }), (e: Error) => ({ data: null, error: e })),
      fetchAllRows<{ customer_id: string | null; final_amount: number | null; customer: unknown }>((from, to) => supabase.from('offers').select('id, customer_id, final_amount, customer:customers!offers_customer_id_fkey(company_name)').eq('status', 'accepted').eq('is_proposal', false).order('id').range(from, to))
        .then((data) => ({ data, error: null }), (e: Error) => ({ data: null, error: e })),
    ])

    // Calculate revenue
    const total_revenue = (acceptedOffersResult.data || []).reduce((sum, o) => sum + (o.final_amount || 0), 0)
    const pending_value = (pendingOffersResult.data || []).reduce((sum, o) => sum + (o.final_amount || 0), 0)

    // Acceptance rate
    const decided = (acceptedCountResult.count || 0) + (rejectedCountResult.count || 0)
    const acceptance_rate = decided > 0 ? ((acceptedCountResult.count || 0) / decided) * 100 : 0

    // Average offer value
    const allOffers = allOffersResult.data || []
    const avg_offer_value = allOffers.length > 0
      ? allOffers.reduce((sum, o) => sum + (o.final_amount || 0), 0) / allOffers.length
      : 0

    // Hours
    const monthEntries = monthEntriesResult.data || []
    const total_hours_this_month = monthEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
    const billable_hours_this_month = monthEntries.reduce(
      (sum, e) => sum + (e.billable !== false ? Number(e.hours) || 0 : 0),
      0,
    )

    // Top customer
    const customerRevenue = new Map<string, { name: string; revenue: number }>()
    for (const offer of topCustomerResult.data || []) {
      if (!offer.customer_id) continue
      const customerData = offer.customer as unknown as { company_name: string } | null
      const existing = customerRevenue.get(offer.customer_id)
      if (existing) {
        existing.revenue += offer.final_amount || 0
      } else {
        customerRevenue.set(offer.customer_id, {
          name: customerData?.company_name || 'Ukendt',
          revenue: offer.final_amount || 0,
        })
      }
    }

    let top_customer_name: string | null = null
    let top_customer_revenue = 0
    for (const [, val] of customerRevenue) {
      if (val.revenue > top_customer_revenue) {
        top_customer_name = val.name
        top_customer_revenue = val.revenue
      }
    }

    return {
      success: true,
      data: {
        total_revenue,
        pending_value,
        acceptance_rate,
        avg_offer_value,
        active_projects: activeProjectsResult.count || 0,
        total_hours_this_month,
        billable_hours_this_month,
        top_customer_name,
        top_customer_revenue,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente rapportoversigt') }
  }
}

// =====================================================
// Revenue by Period (single bulk query)
// =====================================================

export async function getRevenueByPeriod(
  months: number = 6,
): Promise<ActionResult<RevenueByPeriod[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('economy.view')) {
      return { success: false, error: 'Manglende tilladelse: economy.view' }
    }

    // rapport-review: danske kalendermåneder (før serverens UTC — accept kl. 00:30 d. 1. talte i forrige måned)
    const monthKeys = lastMonths(new Date(), months)
    const rangeStartIso = copenhagenLocalToIso(`${monthKeys[0]}-01`, '00:00')

    // Fetch all relevant offers in a single query instead of 2*N queries
    const [acceptedResult, sentResult] = await Promise.all([
      supabase
        .from('offers')
        .select('final_amount, accepted_at')
        .eq('status', 'accepted')
        .eq('is_proposal', false)
        .gte('accepted_at', rangeStartIso),
      supabase
        .from('offers')
        .select('final_amount, created_at')
        .in('status', ['sent', 'viewed'])
        .eq('is_proposal', false)
        .gte('created_at', rangeStartIso),
    ])

    // Build period map
    const periodMap = new Map<string, RevenueByPeriod>()
    const periodKeys: string[] = []

    for (const key of monthKeys) {
      const label = new Date(`${key}-15T12:00:00Z`).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: 'short' })
      periodKeys.push(key)
      periodMap.set(key, {
        period: label,
        accepted_count: 0,
        accepted_revenue: 0,
        sent_count: 0,
        sent_value: 0,
      })
    }

    // Group accepted offers by month
    for (const offer of acceptedResult.data || []) {
      if (!offer.accepted_at) continue
      const key = copenhagenParts(offer.accepted_at).date.slice(0, 7)
      const period = periodMap.get(key)
      if (period) {
        period.accepted_count++
        period.accepted_revenue += offer.final_amount || 0
      }
    }

    // Group sent offers by month
    for (const offer of sentResult.data || []) {
      if (!offer.created_at) continue
      const key = copenhagenParts(offer.created_at).date.slice(0, 7)
      const period = periodMap.get(key)
      if (period) {
        period.sent_count++
        period.sent_value += offer.final_amount || 0
      }
    }

    const periods = periodKeys.map(key => periodMap.get(key)!)

    return { success: true, data: periods }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente omsætningsdata') }
  }
}

// =====================================================
// Revenue by Customer
// =====================================================

export async function getRevenueByCustomer(
  limit: number = 10,
): Promise<ActionResult<RevenueByCustomer[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('economy.view')) {
      return { success: false, error: 'Manglende tilladelse: economy.view' }
    }

    const { data: offers } = await supabase
      .from('offers')
      .select('customer_id, status, final_amount, customer:customers!offers_customer_id_fkey(company_name)')
      .eq('is_proposal', false)
      .not('customer_id', 'is', null)

    if (!offers || offers.length === 0) {
      return { success: true, data: [] }
    }

    const customerMap = new Map<
      string,
      { name: string; total: number; accepted: number; revenue: number }
    >()

    for (const offer of offers) {
      if (!offer.customer_id) continue
      const customer = offer.customer as unknown as { company_name: string } | null
      const existing = customerMap.get(offer.customer_id) || {
        name: customer?.company_name || 'Ukendt',
        total: 0,
        accepted: 0,
        revenue: 0,
      }

      existing.total++
      if (offer.status === 'accepted') {
        existing.accepted++
        existing.revenue += offer.final_amount || 0
      }
      customerMap.set(offer.customer_id, existing)
    }

    const result: RevenueByCustomer[] = Array.from(customerMap.entries())
      .map(([id, data]) => ({
        customer_id: id,
        customer_name: data.name,
        total_offers: data.total,
        accepted_offers: data.accepted,
        total_revenue: data.revenue,
        acceptance_rate: data.total > 0 ? (data.accepted / data.total) * 100 : 0,
      }))
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, limit)

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kundedata') }
  }
}

// =====================================================
// Project Profitability
// =====================================================

export async function getProjectProfitability(): Promise<ActionResult<ProjectProfitability[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('economy.view')) {
      return { success: false, error: 'Manglende tilladelse: economy.view' }
    }

    // N26b: bygger på sager (service_cases + time_logs). Før: den gamle projects/time_entries-model, som ikke bruges
    // længere → rapporten var tom/forkert for alle rigtige sager.
    const { data: cases } = await supabase
      .from('service_cases')
      .select('id, case_number, title, status, budget, planned_hours, source_offer_id, customer:customers!service_cases_customer_id_fkey(company_name)')
      .neq('status', 'converted')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!cases || cases.length === 0) {
      return { success: true, data: [] }
    }

    const caseIds = cases.map((c) => c.id as string)
    // rapport-review: side for side (> 1.000 timeregistreringer på 50 sager blev skåret af → realiseret DB for høj)
    // 00192: kostkolonnen (cost_amount) læses med admin-klienten bag economy.view (samme roller som economy.cost_prices)
    const logs = await fetchAllRows<Record<string, unknown>>((from, to) => createAdminClient()
      .from('time_logs')
      .select('id, hours, billable, end_time, cost_amount, work_order:work_orders!inner(case_id)')
      .in('work_order.case_id', caseIds)
      .not('end_time', 'is', null)
      .neq('approval_status', 'rejected') // afviste timer tæller aldrig (Henrik 2026-10-07)
      .order('id')
      .range(from, to))

    const actual = new Map<string, number>()
    const billable = new Map<string, number>()
    const labourAmounts = new Map<string, Array<number | string | null>>()
    for (const l of (logs ?? []) as unknown as Array<{ hours: number | string | null; billable: boolean | null; cost_amount: number | string | null; work_order: { case_id: string } | Array<{ case_id: string }> }>) {
      const wo = Array.isArray(l.work_order) ? l.work_order[0] : l.work_order
      if (!wo) continue
      const h = Number(l.hours ?? 0) || 0
      actual.set(wo.case_id, (actual.get(wo.case_id) ?? 0) + h)
      if (l.billable !== false) billable.set(wo.case_id, (billable.get(wo.case_id) ?? 0) + h)
      const amounts = labourAmounts.get(wo.case_id) ?? []
      amounts.push(l.cost_amount)
      labourAmounts.set(wo.case_id, amounts)
    }

    // N26d: tilbudt vs. faktisk kost pr. sag (samme matching som Økonomi-fanens linjevisning; timekost aggregeret, D50)
    const offerIds = Array.from(new Set(cases.map((c) => c.source_offer_id as string | null).filter((x): x is string => !!x)))
    const [linesRes, matsRes, invRes, otherRes] = await Promise.all([
      offerIds.length
        // 00192: kostkolonner — admin-klient bag economy.view
        // side for side (profit-review 2026-10-07): 50 tilbud × 20–40 linjer passerer 1.000 → tilbudt kost manglede stille
        ? fetchAllRows<Record<string, unknown>>((from, to) => createAdminClient().from('offer_line_items')
            .select('id, offer_id, description, quantity, unit, cost_price, supplier_cost_price_at_creation, supplier_product_id, position')
            .in('offer_id', offerIds).order('id').range(from, to))
            .then((data) => ({ data: data.sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0)) }))
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      fetchAllRows<Record<string, unknown>>((from, to) => supabase.from('case_materials').select('id, case_id, description, quantity, unit, total_cost, supplier_product_id, source_offer_line_id').in('case_id', caseIds).order('id').range(from, to)).then((data) => ({ data })),
      fetchAllRows<Record<string, unknown>>((from, to) => supabase.from('invoices').select('id, case_id, total_amount, status, invoice_type, voided_at').in('case_id', caseIds).order('id').range(from, to)).then((data) => ({ data })),
      fetchAllRows<Record<string, unknown>>((from, to) => supabase.from('case_other_costs').select('id, case_id, total_cost').in('case_id', caseIds).order('id').range(from, to)).then((data) => ({ data })),
    ])
    const invByCase = new Map<string, RealizedInvoiceInput[]>()
    for (const i of (invRes.data ?? []) as unknown as Array<RealizedInvoiceInput & { case_id: string }>) invByCase.set(i.case_id, [...(invByCase.get(i.case_id) ?? []), i])
    const otherByCase = new Map<string, Array<number | string | null>>()
    for (const o of (otherRes.data ?? []) as unknown as Array<{ case_id: string; total_cost: number | string | null }>) {
      const list = otherByCase.get(o.case_id) ?? []
      list.push(o.total_cost)
      otherByCase.set(o.case_id, list)
    }
    const linesByOffer = new Map<string, OfferLineInput[]>()
    for (const l of (linesRes.data ?? []) as unknown as Array<OfferLineInput & { offer_id: string }>) {
      linesByOffer.set(l.offer_id, [...(linesByOffer.get(l.offer_id) ?? []), l])
    }
    const matsByCase = new Map<string, ActualMaterialInput[]>()
    for (const m of (matsRes.data ?? []) as unknown as Array<ActualMaterialInput & { case_id: string }>) {
      matsByCase.set(m.case_id, [...(matsByCase.get(m.case_id) ?? []), m])
    }
    const r1 = (n: number) => Math.round(n * 10) / 10

    const result: ProjectProfitability[] = cases.map((c) => {
      const customer = (Array.isArray(c.customer) ? c.customer[0] : c.customer) as { company_name: string } | null
      return {
        project_id: c.id as string,
        project_number: (c.case_number as string | null) || '',
        project_name: (c.title as string | null) || '',
        customer_name: customer?.company_name || null,
        status: c.status as string,
        budget: c.budget == null ? null : Number(c.budget),
        actual_hours: r1(actual.get(c.id as string) ?? 0),
        billable_hours: r1(billable.get(c.id as string) ?? 0),
        estimated_hours: c.planned_hours == null ? null : Number(c.planned_hours),
        ...(() => {
          const id = c.id as string
          const lines = c.source_offer_id ? linesByOffer.get(c.source_offer_id as string) ?? [] : []
          const mats = matsByCase.get(id) ?? []
          const amounts = labourAmounts.get(id)
          const cmp = compareOfferToActual(lines, mats, { hours: actual.get(id) ?? 0, cost: amounts ? sumLabourCost(amounts) : null })
          const figures = profitabilityFigures(cmp.rows, otherByCase.get(id) ?? [])
          const invs = invByCase.get(id) ?? []
          const realized = computeRealizedDb(invs, figures.db_cost ?? 0, false)
          const dbKnown = figures.db_cost != null && realized.issued_invoice_count > 0
          return {
            offered_cost: figures.offered_cost,
            actual_cost: figures.actual_cost,
            cost_deviation: figures.cost_deviation,
            net_invoiced: realized.net_invoiced_ex_vat,
            realized_db: dbKnown ? realized.realized_db : null,
            realized_db_pct: dbKnown ? realized.realized_db_pct : null,
          }
        })(),
      }
    })

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente sagsdata') }
  }
}

// =====================================================
// Team Productivity
// =====================================================

export async function getTeamProductivity(
  months: number = 1,
): Promise<ActionResult<TeamProductivity[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('economy.view')) {
      return { success: false, error: 'Manglende tilladelse: economy.view' }
    }

    const since = new Date()
    since.setMonth(since.getMonth() - months)

    // N26b: medarbejdernes timer fra time_logs (før: den gamle time_entries-tabel)
    // HR-review 2026-10-08 (#7): side for side (før afkortet ved 1.000) og navne via admin-klienten efter gaten
    // (employees-RLS 00180 skjuler andres rækker for bogholderi → alle hed "Ukendt")
    const logs = await fetchAllRows<Record<string, unknown>>((f, t) => supabase
      .from('time_logs')
      .select('id, employee_id, hours, billable, end_time, work_order:work_orders(case_id)')
      .gte('start_time', since.toISOString())
      .not('end_time', 'is', null)
      .neq('approval_status', 'rejected') // afviste timer tæller aldrig (Henrik 2026-10-07)
      .order('id')
      .range(f, t)).catch(() => [] as Record<string, unknown>[])
    const empIds = [...new Set(logs.map((l) => l.employee_id as string).filter(Boolean))]
    const { data: emps } = empIds.length ? await createAdminClient().from('employees').select('id, name').in('id', empIds) : { data: [] }
    const empName = new Map(((emps ?? []) as Array<{ id: string; name: string | null }>).map((e) => [e.id, e.name]))
    for (const l of logs) (l as { employee: unknown }).employee = { name: empName.get(l.employee_id as string) ?? null }

    if (!logs || logs.length === 0) {
      return { success: true, data: [] }
    }

    const map = new Map<string, { name: string; total: number; billable: number; cases: Set<string> }>()
    for (const l of logs as unknown as Array<{ employee_id: string; hours: number | string | null; billable: boolean | null;
      work_order: { case_id: string | null } | Array<{ case_id: string | null }> | null; employee: { name: string | null } | Array<{ name: string | null }> | null }>) {
      const emp = Array.isArray(l.employee) ? l.employee[0] : l.employee
      const wo = Array.isArray(l.work_order) ? l.work_order[0] : l.work_order
      const e = map.get(l.employee_id) ?? { name: emp?.name || 'Ukendt', total: 0, billable: 0, cases: new Set<string>() }
      const h = Number(l.hours ?? 0) || 0
      e.total += h
      if (l.billable !== false) e.billable += h
      if (wo?.case_id) e.cases.add(wo.case_id)
      map.set(l.employee_id, e)
    }

    const result: TeamProductivity[] = Array.from(map.entries())
      .map(([id, d]) => ({
        user_id: id,
        full_name: d.name,
        total_hours: Math.round(d.total * 10) / 10,
        billable_hours: Math.round(d.billable * 10) / 10,
        billable_percentage: d.total > 0 ? Math.round((d.billable / d.total) * 100) : 0,
        projects_count: d.cases.size,
      }))
      .sort((a, b) => b.total_hours - a.total_hours)

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente teamdata') }
  }
}

// =====================================================
// Rejection Analytics (Phase 12A payoff)
// =====================================================

const REJECTION_SCOPE_DAYS = 90
const TREND_WINDOW_DAYS = 30
const UNKNOWN_LABEL = 'Ikke angivet'

/**
 * Aggregeret rejection-data til CRM dashboard + reports-side.
 *
 * Scope: seneste 90 dage. Trend sammenligner seneste 30 dage med 30-60
 * dage tilbage. byReason inkluderer en "unknown"-bucket for historiske
 * rejects fra foer Phase 12A (00121) der har rejection_reason = NULL.
 *
 * Bruger authenticated client — kun medarbejdere kan se aggregeringen.
 */
export async function getRejectionStats(): Promise<ActionResult<RejectionStats>> {
  try {
    // Sprint Ø2.13: bevidst IKKE economy.view-gated — bruges af alle på
    // hoved-dashboardet (afvisningsrate/tabt-omsætning-KPI), degraderer
    // gracefully. Afslører ikke intern kost/DB.
    const { supabase } = await getAuthenticatedClientWithRole()

    const now = Date.now()
    const scopeStart = new Date(now - REJECTION_SCOPE_DAYS * 86_400_000)
    const last30Start = new Date(now - TREND_WINDOW_DAYS * 86_400_000)
    const prev30Start = new Date(now - 2 * TREND_WINDOW_DAYS * 86_400_000)

    // 1 query for rejected i scope + 1 count-only for decided-rate
    const [rejectedResult, acceptedCountResult] = await Promise.all([
      supabase
        .from('offers')
        .select('id, rejection_reason, rejected_at, final_amount')
        .eq('status', 'rejected')
        .eq('is_proposal', false)
        .gte('rejected_at', scopeStart.toISOString()),
      supabase
        .from('offers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .eq('is_proposal', false)
        .gte('accepted_at', scopeStart.toISOString()),
    ])

    const rejected = rejectedResult.data || []
    const totalRejected = rejected.length
    const acceptedCount = acceptedCountResult.count || 0

    const decided = totalRejected + acceptedCount
    const rejectionRate = decided > 0 ? (totalRejected / decided) * 100 : 0

    const lostRevenue = rejected.reduce((sum, r) => sum + (r.final_amount || 0), 0)

    // Trend: count rejected i sidste 30 vs forrige 30
    let last30Count = 0
    let prev30Count = 0
    for (const r of rejected) {
      if (!r.rejected_at) continue
      const ts = new Date(r.rejected_at).getTime()
      if (ts >= last30Start.getTime()) {
        last30Count++
      } else if (ts >= prev30Start.getTime()) {
        prev30Count++
      }
    }
    const deltaPercent = prev30Count > 0
      ? ((last30Count - prev30Count) / prev30Count) * 100
      : (last30Count > 0 ? 100 : 0)

    // Aggregér pr. reason-bucket
    const bucketMap = new Map<RejectionReasonBucketKey, { count: number; lostRevenue: number }>()
    for (const r of rejected) {
      const code = (r.rejection_reason ?? 'unknown' as const) as RejectionReasonBucketKey
      const existing = bucketMap.get(code) || { count: 0, lostRevenue: 0 }
      existing.count++
      existing.lostRevenue += r.final_amount || 0
      bucketMap.set(code, existing)
    }

    const byReason: RejectionReasonStat[] = Array.from(bucketMap.entries())
      .map(([code, data]) => ({
        reason: code,
        label: code === 'unknown' as const
          ? UNKNOWN_LABEL
          : REJECTION_REASON_LABELS[code as RejectionReasonCode],
        count: data.count,
        lostRevenue: data.lostRevenue,
        percentage: totalRejected > 0 ? (data.count / totalRejected) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)

    return {
      success: true,
      data: {
        scopeDays: REJECTION_SCOPE_DAYS,
        totalRejected,
        rejectionRate,
        lostRevenue,
        byReason,
        trend: {
          last30Days: last30Count,
          prev30Days: prev30Count,
          deltaPercent,
        },
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente afvisningsstatistik') }
  }
}

/**
 * Top N nyeste afviste tilbud — bruges som widget paa /dashboard.
 *
 * Henter offer-row + customer separat for at undgaa PGRST201 FK-ambiguity
 * (offers har 4 FKs til customers: customer_id, orderer_customer_id,
 * end_customer_id, payer_customer_id). Customer-data joines i app-laget.
 */
export async function getRecentRejections(
  limit: number = 5,
): Promise<ActionResult<RecentRejection[]>> {
  try {
    // Sprint Ø2.13: bevidst IKKE gated — dashboard-delt (se getRejectionStats).
    const { supabase } = await getAuthenticatedClientWithRole()

    const { data: offers, error } = await supabase
      .from('offers')
      .select('id, offer_number, title, customer_id, rejection_reason, rejected_at, final_amount, currency')
      .eq('status', 'rejected')
      .eq('is_proposal', false)
      .not('rejected_at', 'is', null)
      .order('rejected_at', { ascending: false })
      .limit(limit)

    if (error) {
      return { success: false, error: 'Kunne ikke hente afviste tilbud' }
    }
    if (!offers || offers.length === 0) {
      return { success: true, data: [] }
    }

    // Hent customer-data separat (undgaa PGRST201 FK-ambiguity)
    const customerIds = Array.from(
      new Set(offers.map((o) => o.customer_id).filter((id): id is string => !!id)),
    )
    const customerMap = new Map<string, string>()
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customers')
        .select('id, company_name, contact_person')
        .in('id', customerIds)
      for (const c of customers || []) {
        customerMap.set(c.id, c.company_name || c.contact_person || 'Ukendt')
      }
    }

    const result: RecentRejection[] = offers.map((o) => {
      const code = (o.rejection_reason ?? 'unknown' as const) as RejectionReasonBucketKey
      const label = code === 'unknown' as const
        ? UNKNOWN_LABEL
        : REJECTION_REASON_LABELS[code as RejectionReasonCode]
      return {
        id: o.id,
        offer_number: o.offer_number || '',
        title: o.title || '',
        customer_name: o.customer_id ? customerMap.get(o.customer_id) || null : null,
        reason_code: code,
        reason_label: label,
        rejected_at: o.rejected_at!,
        final_amount: o.final_amount || 0,
        currency: o.currency || 'DKK',
      }
    })

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente afviste tilbud') }
  }
}

// =====================================================
// N53: Salgstragt pr. måned
// =====================================================

/** Salgstragt de seneste `months` måneder (nye kunder → tilbud → sendt → accepteret → faktureret). reports.view. */
export async function getSalesFunnel(months: number = 6): Promise<ActionResult<import('@/lib/reports/sales-funnel').SalesFunnel>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('reports.view')) return { success: false, error: 'Manglende tilladelse: reports.view' }
    const { computeSalesFunnel, lastMonths } = await import('@/lib/reports/sales-funnel')
    const list = lastMonths(new Date(), Math.min(Math.max(Math.round(months) || 6, 1), 24))
    // Fra første dag i den ældste måned (lidt før, så dansk tid omkring månedsskiftet er med)
    const since = new Date(`${list[0]}-01T00:00:00Z`)
    since.setUTCDate(since.getUTCDate() - 1)
    const iso = since.toISOString()
    // pagineret (PostgREST afkortede .limit(5000) til 1000); fakturaer efter udstedelse ELLER oprettelse i perioden
    const { fetchAllRows } = await import('@/lib/supabase/fetch-all')
    let cust: { data: unknown[] }, off: { data: unknown[] }, inv: { data: unknown[] }
    try {
      const [c, o, i] = await Promise.all([
        fetchAllRows((f, t) => supabase.from('customers').select('id, created_at').gte('created_at', iso).order('id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('offers').select('id, created_at, sent_at, accepted_at, final_amount, tax_amount, is_proposal')
          .or(`created_at.gte.${iso},sent_at.gte.${iso},accepted_at.gte.${iso}`).order('id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('invoices').select('id, created_at, sent_at, status, invoice_type, voided_at, total_amount')
          .or(`created_at.gte.${iso},sent_at.gte.${iso}`).order('id').range(f, t)),
      ])
      cust = { data: c }; off = { data: o }; inv = { data: i }
    } catch {
      return { success: false, error: 'Kunne ikke hente salgstragt' }
    }
    return {
      success: true,
      data: computeSalesFunnel({
        months: list,
        customers: (cust.data ?? []) as Array<{ created_at: string }>,
        offers: (off.data ?? []) as import('@/lib/reports/sales-funnel').FunnelOffer[],
        invoices: (inv.data ?? []) as import('@/lib/reports/sales-funnel').FunnelInvoice[],
      }),
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente salgstragt') }
  }
}
