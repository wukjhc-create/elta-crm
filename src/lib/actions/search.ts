'use server'

import { createClient } from '@/lib/supabase/server'

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
  error?: string
}

export async function globalSearch(query: string): Promise<SearchResponse> {
  if (!query || query.trim().length < 2) {
    return { success: true, results: [] }
  }

  try {
    const supabase = await createClient()
    const searchTerm = `%${query.trim().toLowerCase()}%`
    const results: SearchResult[] = []

    // Search leads
    const { data: leads } = await supabase
      .from('leads')
      .select('id, contact_person, email, company_name, status')
      .or(`contact_person.ilike.${searchTerm},email.ilike.${searchTerm},company_name.ilike.${searchTerm}`)
      .limit(5)

    if (leads) {
      leads.forEach((lead) => {
        results.push({
          id: lead.id,
          type: 'lead',
          title: lead.contact_person || lead.company_name || 'Ukendt',
          subtitle: lead.company_name || lead.email || 'Lead',
          url: `/leads/${lead.id}`,
        })
      })
    }

    // Search customers
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, email, customer_number')
      .or(`name.ilike.${searchTerm},email.ilike.${searchTerm},customer_number.ilike.${searchTerm}`)
      .limit(5)

    if (customers) {
      customers.forEach((customer) => {
        results.push({
          id: customer.id,
          type: 'customer',
          title: customer.name,
          subtitle: customer.customer_number || customer.email || 'Kunde',
          url: `/customers/${customer.id}`,
        })
      })
    }

    // Search offers
    const { data: offers } = await supabase
      .from('offers')
      .select('id, offer_number, title, status')
      .or(`offer_number.ilike.${searchTerm},title.ilike.${searchTerm}`)
      .limit(5)

    if (offers) {
      offers.forEach((offer) => {
        results.push({
          id: offer.id,
          type: 'offer',
          title: offer.title || offer.offer_number,
          subtitle: offer.offer_number,
          url: `/offers/${offer.id}`,
        })
      })
    }

    // Search projects
    const { data: projects } = await supabase
      .from('projects')
      .select('id, project_number, name, status')
      .or(`project_number.ilike.${searchTerm},name.ilike.${searchTerm}`)
      .limit(5)

    if (projects) {
      projects.forEach((project) => {
        results.push({
          id: project.id,
          type: 'project',
          title: project.name,
          subtitle: project.project_number,
          url: `/projects/${project.id}`,
        })
      })
    }

    return { success: true, results }
  } catch (error) {
    console.error('Search error:', error)
    return { success: false, error: 'Søgning fejlede' }
  }
}
