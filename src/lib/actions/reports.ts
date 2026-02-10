'use server'

/**
 * Reports Server Actions
 *
 * Aggregation queries for the reports dashboard.
 * All data is scoped to the authenticated user's org.
 */

import type { ActionResult } from '@/types/common.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'

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
// Summary
// =====================================================

export async function getReportsSummary(): Promise<ActionResult<ReportsSummary>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Get accepted offers total
    const { data: acceptedOffers } = await supabase
      .from('offers')
      .select('final_amount')
      .eq('status', 'accepted')

    const total_revenue = (acceptedOffers || []).reduce((sum, o) => sum + (o.final_amount || 0), 0)

    // Get pending value
    const { data: pendingOffers } = await supabase
      .from('offers')
      .select('final_amount')
      .in('status', ['sent', 'viewed'])

    const pending_value = (pendingOffers || []).reduce((sum, o) => sum + (o.final_amount || 0), 0)

    // Get acceptance rate
    const { count: acceptedCount } = await supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'accepted')

    const { count: rejectedCount } = await supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'rejected')

    const decided = (acceptedCount || 0) + (rejectedCount || 0)
    const acceptance_rate = decided > 0 ? ((acceptedCount || 0) / decided) * 100 : 0

    // Average offer value
    const { data: allOffers } = await supabase
      .from('offers')
      .select('final_amount')
      .not('status', 'eq', 'draft')

    const avg_offer_value =
      allOffers && allOffers.length > 0
        ? allOffers.reduce((sum, o) => sum + (o.final_amount || 0), 0) / allOffers.length
        : 0

    // Active projects count
    const { count: active_projects } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')

    // This month's hours
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const { data: monthEntries } = await supabase
      .from('time_entries')
      .select('hours, billable')
      .gte('date', monthStart.toISOString())

    const total_hours_this_month = (monthEntries || []).reduce((sum, e) => sum + (e.hours || 0), 0)
    const billable_hours_this_month = (monthEntries || []).reduce(
      (sum, e) => sum + (e.billable ? e.hours || 0 : 0),
      0,
    )

    // Top customer by revenue
    const { data: topCustomerData } = await supabase
      .from('offers')
      .select('customer_id, final_amount, customer:customers(company_name)')
      .eq('status', 'accepted')

    const customerRevenue = new Map<string, { name: string; revenue: number }>()
    for (const offer of topCustomerData || []) {
      if (!offer.customer_id) continue
      const customerData = offer.customer as unknown as unknown as { company_name: string } | null
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
        active_projects: active_projects || 0,
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
// Revenue by Period
// =====================================================

export async function getRevenueByPeriod(
  months: number = 6,
): Promise<ActionResult<RevenueByPeriod[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const now = new Date()
    const periods: RevenueByPeriod[] = []

    for (let i = months - 1; i >= 0; i--) {
      const periodStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const periodEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
      const label = periodStart.toLocaleDateString('da-DK', { year: 'numeric', month: 'short' })

      const { data: accepted } = await supabase
        .from('offers')
        .select('final_amount')
        .eq('status', 'accepted')
        .gte('accepted_at', periodStart.toISOString())
        .lte('accepted_at', periodEnd.toISOString())

      const { data: sent } = await supabase
        .from('offers')
        .select('final_amount')
        .in('status', ['sent', 'viewed'])
        .gte('created_at', periodStart.toISOString())
        .lte('created_at', periodEnd.toISOString())

      periods.push({
        period: label,
        accepted_count: accepted?.length || 0,
        accepted_revenue: (accepted || []).reduce((sum, o) => sum + (o.final_amount || 0), 0),
        sent_count: sent?.length || 0,
        sent_value: (sent || []).reduce((sum, o) => sum + (o.final_amount || 0), 0),
      })
    }

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
      .select('customer_id, status, final_amount, customer:customers(company_name)')
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
