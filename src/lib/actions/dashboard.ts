'use server'

import type { LeadStatus } from '@/types/leads.types'
import type { OfferStatus } from '@/types/offers.types'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { DASHBOARD_LIMITS } from '@/lib/constants'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export interface DashboardStats {
  leads: {
    total: number
    new: number
    contacted: number
    qualified: number
    proposal: number
    negotiation: number
    won: number
    lost: number
    conversionRate: number
  }
  customers: {
    total: number
    active: number
    new_this_month: number
  }
  offers: {
    total: number
    draft: number
    sent: number
    viewed: number
    accepted: number
    rejected: number
    pending_value: number
    accepted_value: number
    acceptance_rate: number
  }
  /** N36: sager + timer (service_cases/time_logs). Før: den gamle projects/time_entries-model → 0 i prod. */
  cases: {
    active: number
    total_hours: number
    billable_hours: number
  }
  messages: {
    unread: number
  }
  customerEmails: {
    unread: number
  }
}

export interface RecentActivity {
  id: string
  type: 'lead' | 'customer' | 'offer' | 'project' | 'message'
  action: string
  title: string
  description?: string
  created_at: string
  link?: string
}

/** Som før: en fejlende forespørgsel giver tomme tal frem for at vælte dashboardet. */
function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  return fetchAllRows(page).catch(() => [] as T[])
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { supabase, userId } = await getAuthenticatedClient()

  // Fetch all stats in parallel
  const [
    leadsResult,
    customersResult,
    offersResult,
    projectsResult,
    timeEntriesResult,
    messagesResult,
    customerEmailsResult,
  ] = await Promise.all([
    // Rækker hentes side for side — PostgREST giver højst 1.000 pr. kald (N36-rest: tallene stod stille ved 1.000)
    allRows<{ status: string }>((f, t) => supabase.from('leads').select('id, status').order('id').range(f, t)),
    allRows<{ is_active: boolean; created_at: string }>((f, t) => supabase.from('customers').select('id, is_active, created_at').order('id').range(f, t)),
    allRows<{ status: string; total_amount: number | null }>((f, t) => supabase.from('offers').select('id, status, total_amount').eq('is_proposal', false).order('id').range(f, t)),
    // N36: sager (ikke gamle projekter)
    // count i databasen (ikke rækker i JS — PostgREST giver højst 1.000 rækker; U70 fandt 999 vs 1.286)
    supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('is_proposal', false).not('status', 'in', '("closed","converted")'),
    // N36: afsluttede timeregistreringer (time_logs — ikke gamle time_entries)
    allRows<{ hours: number | string | null; billable: boolean | null }>((f, t) => supabase.from('time_logs').select('id, hours, billable').not('end_time', 'is', null).order('id').range(f, t)),
    // Unread messages for current user
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('to_user_id', userId)
      .eq('status', 'unread'),
    // Unread customer emails (linked, not archived)
    supabase
      .from('incoming_emails')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('is_archived', false)
      .eq('link_status', 'linked')
      .not('customer_id', 'is', null),
  ])

  const leads = leadsResult
  const customers = customersResult
  const offers = offersResult
  const activeCases = projectsResult.count || 0
  const timeEntries = timeEntriesResult

  // Calculate leads stats
  const leadsByStatus = leads.reduce(
    (acc, lead) => {
      acc[lead.status as LeadStatus] = (acc[lead.status as LeadStatus] || 0) + 1
      return acc
    },
    {} as Record<LeadStatus, number>
  )

  const totalLeads = leads.length
  const wonLeads = leadsByStatus['won'] || 0
  const lostLeads = leadsByStatus['lost'] || 0
  const closedLeads = wonLeads + lostLeads
  const conversionRate = closedLeads > 0 ? Math.round((wonLeads / closedLeads) * 100) : 0

  // Calculate customers stats
  // dansk kalendermåned (serveren kører i UTC — før talte kunder fra 1. kl. 00–02 med i forrige måned)
  const thisMonth = copenhagenParts(new Date()).date.slice(0, 7)
  const activeCustomers = customers.filter((c) => c.is_active).length
  const newCustomersThisMonth = customers.filter(
    (c) => copenhagenParts(c.created_at).date.slice(0, 7) === thisMonth
  ).length

  // Calculate offers stats
  const offersByStatus = offers.reduce(
    (acc, offer) => {
      acc[offer.status as OfferStatus] = (acc[offer.status as OfferStatus] || 0) + 1
      return acc
    },
    {} as Record<OfferStatus, number>
  )

  const pendingOffers = offers.filter((o) =>
    ['sent', 'viewed'].includes(o.status)
  )
  const acceptedOffers = offers.filter((o) => o.status === 'accepted')
  const rejectedOffers = offers.filter((o) => o.status === 'rejected')

  const pendingValue = pendingOffers.reduce(
    (sum, o) => sum + (o.total_amount || 0),
    0
  )
  const acceptedValue = acceptedOffers.reduce(
    (sum, o) => sum + (o.total_amount || 0),
    0
  )
  const decidedOffers = acceptedOffers.length + rejectedOffers.length
  const acceptanceRate =
    decidedOffers > 0 ? Math.round((acceptedOffers.length / decidedOffers) * 100) : 0

  // N36: sager i arbejde (ikke lukket/konverteret) + timer fra time_logs
  const r1 = (n: number) => Math.round(n * 10) / 10
  const totalHours = r1(timeEntries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0))
  const billableHours = r1(timeEntries
    .filter((entry) => entry.billable !== false)
    .reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0))

  return {
    leads: {
      total: totalLeads,
      new: leadsByStatus['new'] || 0,
      contacted: leadsByStatus['contacted'] || 0,
      qualified: leadsByStatus['qualified'] || 0,
      proposal: leadsByStatus['proposal'] || 0,
      negotiation: leadsByStatus['negotiation'] || 0,
      won: wonLeads,
      lost: lostLeads,
      conversionRate,
    },
    customers: {
      total: customers.length,
      active: activeCustomers,
      new_this_month: newCustomersThisMonth,
    },
    offers: {
      total: offers.length,
      draft: offersByStatus['draft'] || 0,
      sent: offersByStatus['sent'] || 0,
      viewed: offersByStatus['viewed'] || 0,
      accepted: offersByStatus['accepted'] || 0,
      rejected: offersByStatus['rejected'] || 0,
      pending_value: pendingValue,
      accepted_value: acceptedValue,
      acceptance_rate: acceptanceRate,
    },
    cases: {
      active: activeCases,
      total_hours: totalHours,
      billable_hours: billableHours,
    },
    messages: {
      unread: messagesResult.count || 0,
    },
    customerEmails: {
      unread: customerEmailsResult.count || 0,
    },
  }
}

export async function getRecentActivity(limit: number = DASHBOARD_LIMITS.RECENT_ACTIVITY): Promise<RecentActivity[]> {
  const { supabase } = await getAuthenticatedClient()

  // Fetch recent items from each table in parallel
  const [leadsResult, customersResult, offersResult, projectsResult] =
    await Promise.all([
      supabase
        .from('leads')
        .select('id, contact_person, company_name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(DASHBOARD_LIMITS.ACTIVITY_PER_TABLE),
      supabase
        .from('customers')
        .select('id, company_name, customer_number, created_at')
        .order('created_at', { ascending: false })
        .limit(DASHBOARD_LIMITS.ACTIVITY_PER_TABLE),
      supabase
        .from('offers')
        .select('id, offer_number, title, status, created_at')
        .eq('is_proposal', false)
        .order('created_at', { ascending: false })
        .limit(DASHBOARD_LIMITS.ACTIVITY_PER_TABLE),
      // N36: sager (ikke gamle projekter)
      supabase
        .from('service_cases')
        .select('id, case_number, title, status, created_at')
        .eq('is_proposal', false)
        .order('created_at', { ascending: false })
        .limit(DASHBOARD_LIMITS.ACTIVITY_PER_TABLE),
    ])

  const activities: RecentActivity[] = []

  // Map leads to activities
  if (leadsResult.data) {
    for (const lead of leadsResult.data) {
      activities.push({
        id: `lead-${lead.id}`,
        type: 'lead',
        action: 'Ny lead',
        title: lead.contact_person,
        description: lead.company_name || undefined,
        created_at: lead.created_at,
        link: `/dashboard/leads/${lead.id}`,
      })
    }
  }

  // Map customers to activities
  if (customersResult.data) {
    for (const customer of customersResult.data) {
      activities.push({
        id: `customer-${customer.id}`,
        type: 'customer',
        action: 'Ny kunde',
        title: customer.company_name,
        description: customer.customer_number,
        created_at: customer.created_at,
        link: `/dashboard/customers/${customer.id}`, // før /customers/… → 404
      })
    }
  }

  // Map offers to activities
  if (offersResult.data) {
    for (const offer of offersResult.data) {
      activities.push({
        id: `offer-${offer.id}`,
        type: 'offer',
        action: 'Nyt tilbud',
        title: offer.offer_number,
        description: offer.title,
        created_at: offer.created_at,
        link: `/dashboard/offers/${offer.id}`, // før /offers/… → 404
      })
    }
  }

  // N36: nye sager (før: gamle projekter med link til /projects/… → 404)
  if (projectsResult.data) {
    for (const sag of projectsResult.data as Array<{ id: string; case_number: string | null; title: string | null; created_at: string }>) {
      activities.push({
        id: `case-${sag.id}`,
        type: 'project',
        action: 'Ny sag',
        title: sag.case_number ?? 'Sag',
        description: sag.title ?? undefined,
        created_at: sag.created_at,
        link: `/dashboard/orders/${sag.id}`,
      })
    }
  }

  // Sort by created_at and limit
  activities.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return activities.slice(0, limit)
}

export async function getUpcomingTasks(limit: number = DASHBOARD_LIMITS.UPCOMING_TASKS): Promise<
  {
    id: string
    title: string
    project_name: string
    project_id: string
    due_date: string | null
    priority: string
    status: string
  }[]
> {
  const { supabase } = await getAuthenticatedClient()

  // N36: kundeopgaver (før: gamle project_tasks → prod 1 række, link til /dashboard/projects/…)
  const { data } = await supabase
    .from('customer_tasks')
    .select('id, title, due_date, priority, status, customer:customers(id, company_name)')
    .neq('status', 'done')
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true })
    .limit(limit)

  if (!data) return []

  return data.map((task) => {
    const c = (Array.isArray(task.customer) ? task.customer[0] : task.customer) as { id: string; company_name: string } | null
    return {
      id: task.id as string,
      title: task.title as string,
      project_name: c?.company_name || '',
      project_id: c?.id || '',
      due_date: task.due_date as string | null,
      priority: task.priority as string,
      status: task.status as string,
    }
  })
}

export async function getPendingOffers(limit: number = DASHBOARD_LIMITS.PENDING_OFFERS): Promise<
  {
    id: string
    offer_number: string
    title: string
    customer_name: string
    total_amount: number
    status: string
    created_at: string
  }[]
> {
  const { supabase } = await getAuthenticatedClient()

  const { data } = await supabase
    .from('offers')
    .select(
      `
      id,
      offer_number,
      title,
      total_amount,
      status,
      created_at,
      customer:customers!offers_customer_id_fkey(company_name)
    `
    )
    .in('status', ['sent', 'viewed'])
    .eq('is_proposal', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!data) return []

  return data.map((offer) => {
    const customer = offer.customer as unknown as { company_name: string } | null
    return {
      id: offer.id,
      offer_number: offer.offer_number,
      title: offer.title,
      customer_name: customer?.company_name || '',
      total_amount: offer.total_amount || 0,
      status: offer.status,
      created_at: offer.created_at,
    }
  })
}

export async function getMonthlyOfferStats(): Promise<{
  sentValue: number
  acceptedValue: number
  sentCount: number
  acceptedCount: number
}> {
  const { supabase } = await getAuthenticatedClient()

  const now = new Date()
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data } = await supabase
    .from('offers')
    .select('status, total_amount')
    .eq('is_proposal', false)
    .gte('created_at', firstDayOfMonth)
    .in('status', ['sent', 'viewed', 'accepted'])

  const offers = data || []

  const sentOffers = offers.filter((o) => o.status === 'sent' || o.status === 'viewed')
  const acceptedOffers = offers.filter((o) => o.status === 'accepted')

  return {
    sentValue: sentOffers.reduce((sum, o) => sum + (o.total_amount || 0), 0),
    acceptedValue: acceptedOffers.reduce((sum, o) => sum + (o.total_amount || 0), 0),
    sentCount: sentOffers.length,
    acceptedCount: acceptedOffers.length,
  }
}
