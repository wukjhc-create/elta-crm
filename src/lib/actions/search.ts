'use server'

import { pgQuote } from '@/lib/validations/postgrest-filter'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { sanitizeSearchTerm } from '@/lib/validations/common'
import type { SearchResultType, SearchResult, SearchResponse } from '@/types/search.types'
import { logger } from '@/lib/utils/logger'

export async function globalSearch(query: string): Promise<SearchResponse> {
  if (!query || query.trim().length < 2) {
    return { success: true, results: [] }
  }

  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    const searchTerm = `%${sanitizeSearchTerm(query.trim().toLowerCase())}%`
    // Leads-review 2026-10-08 (#8): søgningen viste leads/tilbud/projekter uden modul-rettighed (kun RLS) — tom uden
    const none = Promise.resolve({ data: null, count: 0 })

    // P-3 (pilot-review 2026-10-16): også telefon/mobil (opkald) og sager (sagsnr./titel)
    const phoneTerm = `%${sanitizeSearchTerm(query.trim().replace(/[\s-]/g, ''))}%`
    const [leadsResult, customersResult, offersResult, projectsResult, casesResult] = await Promise.all([
      !hasPermission('leads.view') ? none : supabase
        .from('leads')
        .select('id, contact_person, email, company_name, status', { count: 'exact' })
        .or(`contact_person.ilike.${pgQuote(searchTerm)},email.ilike.${pgQuote(searchTerm)},company_name.ilike.${pgQuote(searchTerm)},phone.ilike.${pgQuote(phoneTerm)},phone.ilike.${pgQuote(searchTerm)}`)
        .limit(5),
      !hasPermission('customers.view') ? none : supabase
        .from('customers')
        .select('id, company_name, email, customer_number', { count: 'exact' })
        .or(`company_name.ilike.${pgQuote(searchTerm)},email.ilike.${pgQuote(searchTerm)},customer_number.ilike.${pgQuote(searchTerm)},phone.ilike.${pgQuote(phoneTerm)},mobile.ilike.${pgQuote(phoneTerm)},phone.ilike.${pgQuote(searchTerm)},mobile.ilike.${pgQuote(searchTerm)}`)
        .limit(5),
      !hasPermission('offers.view') ? none : supabase
        .from('offers')
        .select('id, offer_number, title, status', { count: 'exact' })
        .or(`offer_number.ilike.${pgQuote(searchTerm)},title.ilike.${pgQuote(searchTerm)}`)
        .limit(5),
      !hasPermission('projects.view') ? none : supabase
        .from('projects')
        .select('id, project_number, name, status', { count: 'exact' })
        .or(`project_number.ilike.${pgQuote(searchTerm)},name.ilike.${pgQuote(searchTerm)}`)
        .limit(5),
      !hasPermission('cases.view.all') ? none : supabase
        .from('service_cases')
        .select('id, case_number, title, status', { count: 'exact' })
        .eq('is_proposal', false)
        .or(`case_number.ilike.${pgQuote(searchTerm)},title.ilike.${pgQuote(searchTerm)}`)
        .limit(5),
    ])
    // P-9: en fejlende delsøgning logges (før tavst 0)
    for (const [name, res] of [['leads', leadsResult], ['customers', customersResult], ['offers', offersResult], ['projects', projectsResult], ['cases', casesResult]] as const) {
      const err = (res as { error?: unknown }).error
      if (err) logger.error('globalSearch: delsøgning fejlede', { error: err, metadata: { table: name } })
    }

    const results: SearchResult[] = []
    const counts: Record<SearchResultType, number> = {
      lead: leadsResult.count || 0,
      customer: customersResult.count || 0,
      offer: offersResult.count || 0,
      project: projectsResult.count || 0,
      case: casesResult.count || 0,
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

    if (casesResult.data) {
      for (const sc of casesResult.data as Array<{ id: string; case_number: string | null; title: string | null }>) {
        results.push({
          id: sc.id,
          type: 'case',
          title: sc.title || sc.case_number || 'Sag',
          subtitle: sc.case_number || 'Sag',
          url: `/dashboard/orders/${sc.id}`,
        })
      }
    }

    return { success: true, results, counts }
  } catch (error) {
    logger.error('Search error', { error: error })
    return { success: false, error: 'Søgning fejlede' }
  }
}
