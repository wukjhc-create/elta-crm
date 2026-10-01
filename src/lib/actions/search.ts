'use server'

import { pgQuote } from '@/lib/validations/postgrest-filter'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { sanitizeSearchTerm } from '@/lib/validations/common'
import type { SearchResultType, SearchResult, SearchResponse } from '@/types/search.types'
import { logger } from '@/lib/utils/logger'

export async function globalSearch(query: string): Promise<SearchResponse> {
  if (!query || query.trim().length < 2) {
    return { success: true, results: [] }
  }

  try {
    const { supabase } = await getAuthenticatedClient()
    const searchTerm = `%${sanitizeSearchTerm(query.trim().toLowerCase())}%`

    // Execute all four searches in parallel
    const [leadsResult, customersResult, offersResult, projectsResult] = await Promise.all([
      supabase
        .from('leads')
        .select('id, contact_person, email, company_name, status', { count: 'exact' })
        .or(`contact_person.ilike.${pgQuote(searchTerm)},email.ilike.${pgQuote(searchTerm)},company_name.ilike.${pgQuote(searchTerm)}`)
        .limit(5),
      supabase
        .from('customers')
        .select('id, company_name, email, customer_number', { count: 'exact' })
        .or(`company_name.ilike.${pgQuote(searchTerm)},email.ilike.${pgQuote(searchTerm)},customer_number.ilike.${pgQuote(searchTerm)}`)
        .limit(5),
      supabase
        .from('offers')
        .select('id, offer_number, title, status', { count: 'exact' })
        .or(`offer_number.ilike.${pgQuote(searchTerm)},title.ilike.${pgQuote(searchTerm)}`)
        .limit(5),
      supabase
        .from('projects')
        .select('id, project_number, name, status', { count: 'exact' })
        .or(`project_number.ilike.${pgQuote(searchTerm)},name.ilike.${pgQuote(searchTerm)}`)
        .limit(5),
    ])

    const results: SearchResult[] = []
    const counts: Record<SearchResultType, number> = {
      lead: leadsResult.count || 0,
      customer: customersResult.count || 0,
      offer: offersResult.count || 0,
      project: projectsResult.count || 0,
    }

    if (leadsResult.data) {
      for (const lead of leadsResult.data) {
        results.push({
          id: lead.id,
          type: 'lead',
          title: lead.company_name || lead.contact_person || 'Ukendt',
          subtitle: lead.contact_person || lead.email || 'Lead',
          url: `/dashboard/leads/${lead.id}`,
        })
      }
    }

    if (customersResult.data) {
      for (const customer of customersResult.data) {
        results.push({
          id: customer.id,
          type: 'customer',
          title: customer.company_name,
          subtitle: customer.customer_number || customer.email || 'Kunde',
          url: `/dashboard/customers/${customer.id}`,
        })
      }
    }

    if (offersResult.data) {
      for (const offer of offersResult.data) {
        results.push({
          id: offer.id,
          type: 'offer',
          title: offer.title || offer.offer_number,
          subtitle: offer.offer_number,
          url: `/dashboard/offers/${offer.id}`,
        })
      }
    }

    if (projectsResult.data) {
      for (const project of projectsResult.data) {
        results.push({
          id: project.id,
          type: 'project',
          title: project.name,
          subtitle: project.project_number,
          url: `/dashboard/projects/${project.id}`,
        })
      }
    }

    return { success: true, results, counts }
  } catch (error) {
    logger.error('Search error', { error: error })
    return { success: false, error: 'Søgning fejlede' }
  }
}
