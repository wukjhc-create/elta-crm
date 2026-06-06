'use server'

/**
 * Reports Server Actions
 *
 * Aggregation queries for the reports dashboard.
 * All data is scoped to the authenticated user's org.
 */

import type { ActionResult } from '@/types/common.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
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
    const { supabase } = await getAuthenticatedClient()

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

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
      supabase.from('offers').select('final_amount').eq('status', 'accepted').eq('is_proposal', false),
      supabase.from('offers').select('final_amount').in('status', ['sent', 'viewed']).eq('is_proposal', false),
      supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'accepted').eq('is_proposal', false),
      supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'rejected').eq('is_proposal', false),
      supabase.from('offers').select('final_amount').not('status', 'eq', 'draft').eq('is_proposal', false),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('time_entries').select('hours, billable').gte('date', monthStart.toISOString()),
      supabase.from('offers').select('customer_id, final_amount, customer:customers!offers_customer_id_fkey(company_name)').eq('status', 'accepted').eq('is_proposal', false),
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
    const total_hours_this_month = monthEntries.reduce((sum, e) => sum + (e.hours || 0), 0)
    const billable_hours_this_month = monthEntries.reduce(
      (sum, e) => sum + (e.billable ? e.hours || 0 : 0),
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
    const { supabase } = await getAuthenticatedClient()

    const now = new Date()
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)

    // Fetch all relevant offers in a single query instead of 2*N queries
    const [acceptedResult, sentResult] = await Promise.all([
      supabase
        .from('offers')
        .select('final_amount, accepted_at')
        .eq('status', 'accepted')
        .eq('is_proposal', false)
        .gte('accepted_at', rangeStart.toISOString()),
      supabase
        .from('offers')
        .select('final_amount, created_at')
        .in('status', ['sent', 'viewed'])
        .eq('is_proposal', false)
        .gte('created_at', rangeStart.toISOString()),
    ])

    // Build period map
    const periodMap = new Map<string, RevenueByPeriod>()
    const periodKeys: string[] = []

    for (let i = months - 1; i >= 0; i--) {
      const periodStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = periodStart.toLocaleDateString('da-DK', { year: 'numeric', month: 'short' })
      const key = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`
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
      const d = new Date(offer.accepted_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const period = periodMap.get(key)
      if (period) {
        period.accepted_count++
        period.accepted_revenue += offer.final_amount || 0
      }
    }

    // Group sent offers by month
    for (const offer of sentResult.data || []) {
      if (!offer.created_at) continue
      const d = new Date(offer.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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
    const { supabase } = await getAuthenticatedClient()

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
    const { supabase } = await getAuthenticatedClient()

    const { data: projects } = await supabase
      .from('projects')
      .select(
        'id, project_number, name, status, budget, estimated_hours, actual_hours, customer:customers(company_name)',
      )
      .in('status', ['active', 'completed'])
      .order('created_at', { ascending: false })
      .limit(50)

    if (!projects || projects.length === 0) {
      return { success: true, data: [] }
    }

    // Get billable hours per project
    const projectIds = projects.map((p) => p.id)
    const { data: timeEntries } = await supabase
      .from('time_entries')
      .select('project_id, hours, billable')
      .in('project_id', projectIds)

    const billableMap = new Map<string, number>()
    for (const entry of timeEntries || []) {
      if (entry.billable) {
        billableMap.set(
          entry.project_id,
          (billableMap.get(entry.project_id) || 0) + (entry.hours || 0),
        )
      }
    }

    const result: ProjectProfitability[] = projects.map((p) => {
      const customer = p.customer as unknown as { company_name: string } | null
      return {
        project_id: p.id,
        project_number: p.project_number || '',
        project_name: p.name,
        customer_name: customer?.company_name || null,
        status: p.status,
        budget: p.budget,
        actual_hours: p.actual_hours || 0,
        billable_hours: billableMap.get(p.id) || 0,
        estimated_hours: p.estimated_hours,
      }
    })

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente projektdata') }
  }
}

// =====================================================
// Team Productivity
// =====================================================

export async function getTeamProductivity(
  months: number = 1,
): Promise<ActionResult<TeamProductivity[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const since = new Date()
    since.setMonth(since.getMonth() - months)

    const { data: entries } = await supabase
      .from('time_entries')
      .select('user_id, hours, billable, project_id')
      .gte('date', since.toISOString())

    if (!entries || entries.length === 0) {
      return { success: true, data: [] }
    }

    // Aggregate by user
    const userMap = new Map<
      string,
      { total: number; billable: number; projects: Set<string> }
    >()

    for (const entry of entries) {
      const existing = userMap.get(entry.user_id) || {
        total: 0,
        billable: 0,
        projects: new Set<string>(),
      }
      existing.total += entry.hours || 0
      if (entry.billable) existing.billable += entry.hours || 0
      if (entry.project_id) existing.projects.add(entry.project_id)
      userMap.set(entry.user_id, existing)
    }

    // Get user names
    const userIds = Array.from(userMap.keys())
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds)

    const nameMap = new Map<string, string>()
    for (const profile of profiles || []) {
      nameMap.set(profile.id, profile.full_name || profile.email)
    }

    const result: TeamProductivity[] = Array.from(userMap.entries())
      .map(([id, data]) => ({
        user_id: id,
        full_name: nameMap.get(id) || 'Ukendt',
        total_hours: Math.round(data.total * 10) / 10,
        billable_hours: Math.round(data.billable * 10) / 10,
        billable_percentage: data.total > 0 ? Math.round((data.billable / data.total) * 100) : 0,
        projects_count: data.projects.size,
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
    const { supabase } = await getAuthenticatedClient()

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
    const { supabase } = await getAuthenticatedClient()

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
