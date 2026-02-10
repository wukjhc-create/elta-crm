'use server'

import { getAuthenticatedClient } from '@/lib/actions/action-helpers'

export type SearchResultType = 'lead' | 'customer' | 'offer' | 'project'

export interface SearchResult {
  id: string
  type: SearchResultType
  title: string
  subtitle: string
  url: string
}

export interface SearchResponse {
  success: boolean
  results?: SearchResult[]
  counts?: Record<SearchResultType, number>
  error?: string
}

export async function globalSearch(query: string): Promise<SearchResponse> {
  if (!query || query.trim().length < 2) {
    return { success: true, results: [] }
  }

  try {
    const { supabase } = await getAuthenticatedClient()
    const searchTerm = `%${query.trim().toLowerCase()}%`
    const results: SearchResult[] = []
    const counts: Record<SearchResultType, number> = { lead: 0, customer: 0, offer: 0, project: 0 }

    // Search leads
    const { data: leads, count: leadCount } = await supabase
      .from('leads')
      .select('id, contact_person, email, company_name, status', { count: 'exact' })
      .or(`contact_person.ilike.${searchTerm},email.ilike.${searchTerm},company_name.ilike.${searchTerm}`)
      .limit(5)

    counts.lead = leadCount || 0
    if (leads) {
      leads.forEach((lead) => {
        results.push({
          id: lead.id,
          type: 'lead',
          title: lead.company_name || lead.contact_person || 'Ukendt',
          subtitle: lead.contact_person || lead.email || 'Lead',
          url: `/dashboard/leads/${lead.id}`,
        })
      })
    }

    // Search customers
    const { data: customers, count: customerCount } = await supabase
      .from('customers')
      .select('id, company_name, email, customer_number', { count: 'exact' })
      .or(`company_name.ilike.${searchTerm},email.ilike.${searchTerm},customer_number.ilike.${searchTerm}`)
      .limit(5)

    counts.customer = customerCount || 0
    if (customers) {
      customers.forEach((customer) => {
        results.push({
          id: customer.id,
          type: 'customer',
          title: customer.company_name,
          subtitle: customer.customer_number || customer.email || 'Kunde',
          url: `/dashboard/customers/${customer.id}`,
        })
      })
    }

    // Search offers
    const { data: offers, count: offerCount } = await supabase
      .from('offers')
      .select('id, offer_number, title, status', { count: 'exact' })
      .or(`offer_number.ilike.${searchTerm},title.ilike.${searchTerm}`)
      .limit(5)

    counts.offer = offerCount || 0
    if (offers) {
      offers.forEach((offer) => {
        results.push({
          id: offer.id,
          type: 'offer',
          title: offer.title || offer.offer_number,
          subtitle: offer.offer_number,
          url: `/dashboard/offers/${offer.id}`,
        })
      })
    }

    // Search projects
    const { data: projects, count: projectCount } = await supabase
      .from('projects')
      .select('id, project_number, name, status', { count: 'exact' })
      .or(`project_number.ilike.${searchTerm},name.ilike.${searchTerm}`)
      .limit(5)

    counts.project = projectCount || 0
    if (projects) {
      projects.forEach((project) => {
        results.push({
          id: project.id,
          type: 'project',
          title: project.name,
          subtitle: project.project_number,
          url: `/dashboard/projects/${project.id}`,
        })
      })
    }

    return { success: true, results, counts }
  } catch (error) {
    console.error('Search error:', error)
    return { success: false, error: 'Søgning fejlede' }
  }
}
