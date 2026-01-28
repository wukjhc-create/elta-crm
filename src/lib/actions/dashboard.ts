'use server'

import { createClient, getUser } from '@/lib/supabase/server'
import type { LeadStatus } from '@/types/leads.types'
import type { OfferStatus } from '@/types/offers.types'
import type { ProjectStatus } from '@/types/projects.types'

// =====================================================
// Helper Functions
// =====================================================

async function requireAuth(): Promise<string> {
  const user = await getUser()
  if (!user) {
    throw new Error('AUTH_REQUIRED')
  }
  return user.id
}

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
  projects: {
    total: number
    planning: number
    active: number
    on_hold: number
    completed: number
    cancelled: number
    total_hours: number
    billable_hours: number
  }
  messages: {
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

export async function getDashboardStats(): Promise<DashboardStats> {
  const userId = await requireAuth()
  const supabase = await createClient()

  // Fetch all stats in parallel
  const [
    leadsResult,
    customersResult,
    offersResult,
    projectsResult,
    timeEntriesResult,
    messagesResult,
  ] = await Promise.all([
    // Leads stats
    supabase.from('leads').select('status'),
    // Customers stats
    supabase.from('customers').select('is_active, created_at'),
    // Offers stats
    supabase.from('offers').select('status, total_amount'),
    // Projects stats
    supabase.from('projects').select('status'),
    // Time entries for project hours
    supabase.from('time_entries').select('hours, billable'),
    // Unread messages for current user
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('to_user_id', userId)
      .eq('status', 'unread'),
  ])

  const leads = leadsResult.data || []
  const customers = customersResult.data || []
  const offers = offersResult.data || []
  const projects = projectsResult.data || []
  const timeEntries = timeEntriesResult.data || []

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
  const now = new Date()
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const activeCustomers = customers.filter((c) => c.is_active).length
  const newCustomersThisMonth = customers.filter(
    (c) => new Date(c.created_at) >= firstDayOfMonth
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

  // Calculate projects stats
  const projectsByStatus = projects.reduce(
    (acc, project) => {
      acc[project.status as ProjectStatus] =
        (acc[project.status as ProjectStatus] || 0) + 1
      return acc
    },
    {} as Record<ProjectStatus, number>
  )

  const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0)
  const billableHours = timeEntries
    .filter((entry) => entry.billable)
    .reduce((sum, entry) => sum + entry.hours, 0)

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
    projects: {
      total: projects.length,
      planning: projectsByStatus['planning'] || 0,
      active: projectsByStatus['active'] || 0,
      on_hold: projectsByStatus['on_hold'] || 0,
      completed: projectsByStatus['completed'] || 0,
      cancelled: projectsByStatus['cancelled'] || 0,
      total_hours: totalHours,
      billable_hours: billableHours,
    },
    messages: {
      unread: messagesResult.count || 0,
    },
  }
}

export async function getRecentActivity(limit = 10): Promise<RecentActivity[]> {
  await requireAuth()
  const supabase = await createClient()

  // Fetch recent items from each table in parallel
  const [leadsResult, customersResult, offersResult, projectsResult] =
    await Promise.all([
      supabase
        .from('leads')
        .select('id, contact_person, company_name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('customers')
        .select('id, company_name, customer_number, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('offers')
        .select('id, offer_number, title, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('projects')
        .select('id, project_number, name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
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
        link: `/customers/${customer.id}`,
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
        link: `/offers/${offer.id}`,
      })
    }
  }

  // Map projects to activities
  if (projectsResult.data) {
    for (const project of projectsResult.data) {
      activities.push({
        id: `project-${project.id}`,
        type: 'project',
        action: 'Nyt projekt',
        title: project.project_number,
        description: project.name,
        created_at: project.created_at,
        link: `/projects/${project.id}`,
      })
    }
  }

  // Sort by created_at and limit
  activities.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return activities.slice(0, limit)
}

export async function getUpcomingTasks(limit = 5): Promise<
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
  await requireAuth()
  const supabase = await createClient()

  const { data } = await supabase
    .from('project_tasks')
    .select(
      `
      id,
      title,
      due_date,
      priority,
      status,
      project:projects(id, name, project_number)
    `
    )
    .not('status', 'eq', 'done')
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true })
    .limit(limit)

  if (!data) return []

  return data.map((task) => {
    const project = task.project as unknown as { id: string; name: string; project_number: string } | null
    return {
      id: task.id,
      title: task.title,
      project_name: project?.project_number || '',
      project_id: project?.id || '',
      due_date: task.due_date,
      priority: task.priority,
      status: task.status,
    }
  })
}

export async function getPendingOffers(limit = 5): Promise<
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
  await requireAuth()
  const supabase = await createClient()

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
      customer:customers(company_name)
    `
    )
    .in('status', ['sent', 'viewed'])
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
