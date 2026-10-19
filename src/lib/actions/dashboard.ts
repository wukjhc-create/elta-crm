'use server'

import type { LeadStatus } from '@/types/leads.types'
import type { OfferStatus } from '@/types/offers.types'
import { getAuthenticatedClient, getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { DASHBOARD_LIMITS } from '@/lib/constants'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { logger } from '@/lib/utils/logger'
import { copenhagenLocalToIso, copenhagenParts } from '@/lib/utils/copenhagen-time'

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
  /** B-10 (pilot-review 2026-10-15): mindst én forespørgsel fejlede — tallene er ufuldstændige (før: tavst 0) */
  incomplete?: boolean
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

/** En fejlende forespørgsel giver tomme tal frem for at vælte siden (bruges af de øvrige dashboard-funktioner). */
function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  return fetchAllRows(page).catch(() => [] as T[])
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const roleCtx = await getAuthenticatedClientWithRole()
  const { supabase, userId } = roleCtx
  // En fejlende forespørgsel giver tomme tal frem for at vælte dashboardet — men markeres (B-10), så siden kan sige det
  let incomplete = false
  const allRows = <T,>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> =>
    fetchAllRows(page).catch((err) => { incomplete = true; logger.error('getDashboardStats: query failed', { error: err }); return [] as T[] })

  // Q-1 (review 2026-10-16): leads og kunder tælles i databasen (HEAD-count) i stedet for at hente alle rækker side for
  // side ved hver dashboard-indlæsning. Kundernes "nye denne måned" = oprettet fra 1. i dansk kalendermåned.
  const LEAD_STATUSES_ALL: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']
  const monthStartIso = copenhagenLocalToIso(`${copenhagenParts(new Date()).date.slice(0, 7)}-01`, '00:00')
  const headCount = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> => {
    const r = await q
    if (r.error) { incomplete = true; logger.error('getDashboardStats: count failed', { error: r.error }); return 0 }
    return r.count ?? 0
  }
  // PF-2 (performance-review 2026-10-16): ÉN parallel runde (før to efter hinanden); tilbud tælles i databasen pr. status
  // (HEAD), og beløb hentes kun for de statusser der summeres (sendt/set/accepteret) — før alle tilbud nogensinde
  const OFFER_STATUSES_ALL: OfferStatus[] = ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired']
  const [
    leadCounts, customerTotal, customerActive, customerNew,
    offerCounts, offersTotal,
    offersResult,
    projectsResult,
    timeEntriesResult,
    messagesResult,
    customerEmailsResult,
  ] = await Promise.all([
    // PM2-2/PM2-4: leadtal kun med leads.view
    roleCtx.hasPermission('leads.view')
      ? Promise.all(LEAD_STATUSES_ALL.map((st) => headCount(supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', st))))
      : Promise.resolve(LEAD_STATUSES_ALL.map(() => 0)),
    headCount(supabase.from('customers').select('id', { count: 'exact', head: true })),
    headCount(supabase.from('customers').select('id', { count: 'exact', head: true }).eq('is_active', true)),
    headCount(supabase.from('customers').select('id', { count: 'exact', head: true }).gte('created_at', monthStartIso)),
    Promise.all(OFFER_STATUSES_ALL.map((st) => headCount(supabase.from('offers').select('id', { count: 'exact', head: true }).eq('is_proposal', false).eq('status', st)))),
    headCount(supabase.from('offers').select('id', { count: 'exact', head: true }).eq('is_proposal', false)),
    // Rækker hentes side for side — PostgREST giver højst 1.000 pr. kald (N36-rest: tallene stod stille ved 1.000)
    // Rapport-review 2026-10-09 (#2): værdi ekskl. moms efter rabat (final − tax) — total_amount er subtotal før rabat
    allRows<{ status: string; final_amount: number | null; tax_amount: number | null }>((f, t) => supabase.from('offers').select('id, status, final_amount, tax_amount').eq('is_proposal', false).in('status', ['sent', 'viewed', 'accepted']).order('id').range(f, t)),
    // N36: sager (ikke gamle projekter)
    // count i databasen (ikke rækker i JS — PostgREST giver højst 1.000 rækker; U70 fandt 999 vs 1.286)
    // DB-1 (dashboard-review 2026-10-18): roller uden cases.view.all (salg) tæller kun egne sager (som listen de klikker til)
    (async () => {
      if (roleCtx.hasPermission('cases.view.all')) {
        return supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('is_proposal', false).not('status', 'in', '("closed","converted")')
      }
      const { getCaseScope } = await import('@/lib/auth/case-scope')
      const scope = await getCaseScope({ role: roleCtx.role, userId: roleCtx.userId, supabase })
      if (scope.type === 'all') return supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('is_proposal', false).not('status', 'in', '("closed","converted")')
      let count = 0
      for (let k = 0; k < scope.caseIds.length; k += 200) {
        const r = await supabase.from('service_cases').select('id', { count: 'exact', head: true }).eq('is_proposal', false)
          .not('status', 'in', '("closed","converted")').in('id', scope.caseIds.slice(k, k + 200))
        count += r.count ?? 0
      }
      return { count, error: null }
    })(),
    // N36: afsluttede timeregistreringer (time_logs — ikke gamle time_entries)
    allRows<{ hours: number | string | null; billable: boolean | null }>((f, t) => supabase.from('time_logs').select('id, hours, billable').not('end_time', 'is', null).neq('approval_status', 'rejected').order('id').range(f, t)),
    // Unread messages for current user
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('to_user_id', userId)
      .eq('status', 'unread'),
    // Unread customer emails (linked, not archived)
    // PM2-1 (Henrik 2026-10-19): postkasse-afledt tal kun med inbox.view eller den eksplicitte kundemail-ret
    (roleCtx.hasPermission('inbox.view') || roleCtx.hasPermission('customers.emails.view'))
      ? supabase
        .from('incoming_emails')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
        .eq('is_archived', false)
        .eq('link_status', 'linked')
        .not('customer_id', 'is', null)
      : Promise.resolve({ count: 0, error: null }),
  ])

  const offers = offersResult
  const activeCases = projectsResult.count || 0
  const timeEntries = timeEntriesResult

  // Calculate leads stats
  const leadsByStatus = Object.fromEntries(LEAD_STATUSES_ALL.map((st, i) => [st, leadCounts[i]])) as Record<LeadStatus, number>

  const totalLeads = leadCounts.reduce((a, b) => a + b, 0)
  const wonLeads = leadsByStatus['won'] || 0
  const lostLeads = leadsByStatus['lost'] || 0
  const closedLeads = wonLeads + lostLeads
  const conversionRate = closedLeads > 0 ? Math.round((wonLeads / closedLeads) * 100) : 0

  // Calculate customers stats
  // dansk kalendermåned (serveren kører i UTC — før talte kunder fra 1. kl. 00–02 med i forrige måned)
  const activeCustomers = customerActive
  const newCustomersThisMonth = customerNew

  // Calculate offers stats (PF-2: antal fra HEAD-counts; rækkerne er kun sendt/set/accepteret til beløbene)
  const offersByStatus = Object.fromEntries(OFFER_STATUSES_ALL.map((st, i) => [st, offerCounts[i]])) as Record<OfferStatus, number>

  const pendingOffers = offers.filter((o) =>
    ['sent', 'viewed'].includes(o.status)
  )
  const acceptedOffers = offers.filter((o) => o.status === 'accepted')

  const pendingValue = pendingOffers.reduce((sum, o) => sum + offerExVat(o), 0)
  const acceptedValue = acceptedOffers.reduce((sum, o) => sum + offerExVat(o), 0)
  const decidedOffers = (offersByStatus['accepted'] || 0) + (offersByStatus['rejected'] || 0)
  const acceptanceRate =
    decidedOffers > 0 ? Math.round(((offersByStatus['accepted'] || 0) / decidedOffers) * 100) : 0

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
      total: customerTotal,
      active: activeCustomers,
      new_this_month: newCustomersThisMonth,
    },
    offers: {
      total: offersTotal,
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
    incomplete: incomplete || !!projectsResult.error || !!messagesResult.error || !!customerEmailsResult.error,
    customerEmails: {
      unread: customerEmailsResult.count || 0,
    },
  }
}

export async function getRecentActivity(limit: number = DASHBOARD_LIMITS.RECENT_ACTIVITY): Promise<RecentActivity[]> {
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  // LD-14 (leads-review 2026-10-18): hver sektion kun med læseretten til modulet — før fik fx bogholderi leadets
  // kontaktnavne uden leads.view (kun RLS stod imellem)
  const none = Promise.resolve({ data: null as null })

  // Fetch recent items from each table in parallel
  const [leadsResult, customersResult, offersResult, projectsResult] =
    await Promise.all([
      !hasPermission('leads.view') ? none : supabase
        .from('leads')
        .select('id, contact_person, company_name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(DASHBOARD_LIMITS.ACTIVITY_PER_TABLE),
      !hasPermission('customers.view') ? none : supabase
        .from('customers')
        .select('id, company_name, customer_number, created_at')
        .order('created_at', { ascending: false })
        .limit(DASHBOARD_LIMITS.ACTIVITY_PER_TABLE),
      !hasPermission('offers.view') ? none : supabase
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
  const ctx = await getAuthenticatedClientWithRole()
  const { supabase } = ctx

  // N36: kundeopgaver (før: gamle project_tasks → prod 1 række, link til /dashboard/projects/…)
  // TK-6 (review 2026-10-17): samme rolle-afgrænsning som opgavesiden (W-8)
  const { scopeTaskQuery } = await import('@/lib/tasks/task-scope')
  const q = scopeTaskQuery(supabase
    .from('customer_tasks')
    .select('id, title, due_date, priority, status, customer:customers(id, company_name)')
    .neq('status', 'done')
    .not('due_date', 'is', null), { role: ctx.role, userId: ctx.userId, hasPermission: ctx.hasPermission as never })
  if (!q) return []
  const { data } = await q
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
      final_amount,
      tax_amount,
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
      // S-3 (pilot-review 2026-10-15): samme beløb som stat-kortet (efter rabat, ekskl. moms) — før total_amount (før rabat)
      total_amount: offerExVat(offer as { final_amount?: number | null; tax_amount?: number | null }),
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
  /** DB-2: afviste i måneden (rejected_at) — nævner i hitraten */
  rejectedCount: number
}> {
  const { supabase } = await getAuthenticatedClient()

  // Rapport-review 2026-10-09 (#9): dansk månedsstart (før serverens UTC → 00–02 den 1. tabt), alle rækker, ekskl. moms
  const firstDayOfMonth = copenhagenLocalToIso(`${copenhagenParts(new Date()).date.slice(0, 7)}-01`, '00:00')

  // DB-2 (dashboard-review 2026-10-18): kohorter efter HÆNDELSESDATO — sendt (sent_at), accepteret (accepted_at),
  // afvist (rejected_at) i måneden. Før efter created_at og kun status sendt/set/accepteret: et tilbud oprettet 28/9 og
  // accepteret 2/10 talte aldrig; sendt-og-accepteret talte ikke som sendt; afviste forsvandt (hitrate 40 % mod reelt 29 %)
  type Row = { status: string; final_amount: number | null; tax_amount: number | null }
  const byDate = (col: 'sent_at' | 'accepted_at' | 'rejected_at') => allRows<Row>((f, t) => supabase
    .from('offers')
    .select('id, status, final_amount, tax_amount')
    .eq('is_proposal', false)
    .gte(col, firstDayOfMonth)
    .order('id')
    .range(f, t))
  const [sentOffers, acceptedOffers, rejectedOffers] = await Promise.all([byDate('sent_at'), byDate('accepted_at'), byDate('rejected_at')])

  return {
    sentValue: sentOffers.reduce((sum, o) => sum + offerExVat(o), 0),
    acceptedValue: acceptedOffers.reduce((sum, o) => sum + offerExVat(o), 0),
    sentCount: sentOffers.length,
    acceptedCount: acceptedOffers.length,
    rejectedCount: rejectedOffers.length,
  }
}

/** Tilbudsværdi ekskl. moms efter rabat (final_amount − tax_amount) — samme grundlag som rapporter og salgstragt. */
function offerExVat(o: { final_amount?: number | string | null; tax_amount?: number | string | null }): number {
  return Number(o.final_amount ?? 0) - Number(o.tax_amount ?? 0)
}
