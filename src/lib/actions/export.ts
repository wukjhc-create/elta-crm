'use server'

/**
 * Data Export Server Actions
 *
 * Fetches all records (no pagination) for CSV export.
 * Each function returns flat data arrays ready for CSV generation.
 */

import type { ActionResult } from '@/types/common.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { sanitizeSearchTerm } from '@/lib/validations/common'

// =====================================================
// Types
// =====================================================

export interface ExportCustomer {
  customer_number: string | null
  company_name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  vat_number: string | null
  billing_address: string | null
  billing_city: string | null
  billing_zip: string | null
  is_active: boolean
  notes: string | null
  created_at: string
}

export interface ExportLead {
  company_name: string | null
  contact_person: string | null
  email: string | null
  phone: string | null
  status: string
  source: string | null
  value: number | null
  probability: number | null
  description: string | null
  assigned_to_name: string | null
  created_at: string
}

export interface ExportOffer {
  offer_number: string | null
  title: string
  customer_name: string | null
  customer_number: string | null
  status: string
  total_amount: number | null
  discount_amount: number | null
  final_amount: number | null
  valid_until: string | null
  notes: string | null
  created_at: string
}

export interface ExportProject {
  project_number: string | null
  name: string
  customer_name: string | null
  customer_number: string | null
  status: string
  priority: string | null
  start_date: string | null
  end_date: string | null
  estimated_hours: number | null
  actual_hours: number | null
  budget: number | null
  actual_cost: number | null
  description: string | null
  created_at: string
}

export interface ExportCalculation {
  name: string
  calculation_type: string | null
  customer_name: string | null
  customer_number: string | null
  is_template: boolean
  total_amount: number | null
  final_amount: number | null
  created_by_name: string | null
  created_at: string
}

// =====================================================
// Export Actions
// =====================================================

const MAX_EXPORT_ROWS = 10000

export async function exportCustomers(filters?: {
  search?: string
  is_active?: boolean
}): Promise<ActionResult<ExportCustomer[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('customers')
      .select('customer_number, company_name, contact_person, email, phone, vat_number, billing_address, billing_city, billing_zip, is_active, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS)

    if (filters?.search) {
      const term = `%${sanitizeSearchTerm(filters.search)}%`
      query = query.or(`company_name.ilike.${term},contact_person.ilike.${term},email.ilike.${term}`)
    }

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: 'Kunne ikke hente kundedata til eksport' }
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Eksport af kunder fejlede') }
  }
}

export async function exportLeads(filters?: {
  search?: string
  status?: string
  source?: string
}): Promise<ActionResult<ExportLead[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('leads')
      .select('company_name, contact_person, email, phone, status, source, value, probability, description, assigned_to_profile:profiles!assigned_to(full_name), created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS)

    if (filters?.search) {
      const term = `%${sanitizeSearchTerm(filters.search)}%`
      query = query.or(`company_name.ilike.${term},contact_person.ilike.${term},email.ilike.${term}`)
    }

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.source) {
      query = query.eq('source', filters.source)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: 'Kunne ikke hente leads til eksport' }
    }

    // Flatten the assigned_to profile join
    const flat: ExportLead[] = (data || []).map((row: Record<string, unknown>) => ({
      company_name: row.company_name as string | null,
      contact_person: row.contact_person as string | null,
      email: row.email as string | null,
      phone: row.phone as string | null,
      status: row.status as string,
      source: row.source as string | null,
      value: row.value as number | null,
      probability: row.probability as number | null,
      description: row.description as string | null,
      assigned_to_name: (row.assigned_to_profile as { full_name: string } | null)?.full_name || null,
      created_at: row.created_at as string,
    }))

    return { success: true, data: flat }
  } catch (err) {
    return { success: false, error: formatError(err, 'Eksport af leads fejlede') }
  }
}

export async function exportOffers(filters?: {
  search?: string
  status?: string
}): Promise<ActionResult<ExportOffer[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('offers')
      .select('offer_number, title, customer:customers(company_name, customer_number), status, total_amount, discount_amount, final_amount, valid_until, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS)

    if (filters?.search) {
      const term = `%${sanitizeSearchTerm(filters.search)}%`
      query = query.or(`title.ilike.${term},offer_number.ilike.${term}`)
    }

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: 'Kunne ikke hente tilbud til eksport' }
    }

    const flat: ExportOffer[] = (data || []).map((row: Record<string, unknown>) => {
      const customer = row.customer as { company_name: string; customer_number: string } | null
      return {
        offer_number: row.offer_number as string | null,
        title: row.title as string,
        customer_name: customer?.company_name || null,
        customer_number: customer?.customer_number || null,
        status: row.status as string,
        total_amount: row.total_amount as number | null,
        discount_amount: row.discount_amount as number | null,
        final_amount: row.final_amount as number | null,
        valid_until: row.valid_until as string | null,
        notes: row.notes as string | null,
        created_at: row.created_at as string,
      }
    })

    return { success: true, data: flat }
  } catch (err) {
    return { success: false, error: formatError(err, 'Eksport af tilbud fejlede') }
  }
}

export async function exportProjects(filters?: {
  search?: string
  status?: string
  priority?: string
}): Promise<ActionResult<ExportProject[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('projects')
      .select('project_number, name, customer:customers(company_name, customer_number), status, priority, start_date, end_date, estimated_hours, actual_hours, budget, actual_cost, description, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS)

    if (filters?.search) {
      const term = `%${sanitizeSearchTerm(filters.search)}%`
      query = query.or(`name.ilike.${term},project_number.ilike.${term}`)
    }

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.priority) {
      query = query.eq('priority', filters.priority)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: 'Kunne ikke hente projekter til eksport' }
    }

    const flat: ExportProject[] = (data || []).map((row: Record<string, unknown>) => {
      const customer = row.customer as { company_name: string; customer_number: string } | null
      return {
        project_number: row.project_number as string | null,
        name: row.name as string,
        customer_name: customer?.company_name || null,
        customer_number: customer?.customer_number || null,
        status: row.status as string,
        priority: row.priority as string | null,
        start_date: row.start_date as string | null,
        end_date: row.end_date as string | null,
        estimated_hours: row.estimated_hours as number | null,
        actual_hours: row.actual_hours as number | null,
        budget: row.budget as number | null,
        actual_cost: row.actual_cost as number | null,
        description: row.description as string | null,
        created_at: row.created_at as string,
      }
    })

    return { success: true, data: flat }
  } catch (err) {
    return { success: false, error: formatError(err, 'Eksport af projekter fejlede') }
  }
}

export async function exportCalculations(filters?: {
  search?: string
  calculation_type?: string
  is_template?: boolean
}): Promise<ActionResult<ExportCalculation[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('calculations')
      .select('name, calculation_type, customer:customers(company_name, customer_number), is_template, total_amount, final_amount, created_by_profile:profiles!created_by(full_name), created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS)

    if (filters?.search) {
      const term = `%${sanitizeSearchTerm(filters.search)}%`
      query = query.or(`name.ilike.${term}`)
    }

    if (filters?.calculation_type) {
      query = query.eq('calculation_type', filters.calculation_type)
    }

    if (filters?.is_template !== undefined) {
      query = query.eq('is_template', filters.is_template)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: 'Kunne ikke hente kalkulationer til eksport' }
    }

    const flat: ExportCalculation[] = (data || []).map((row: Record<string, unknown>) => {
      const customer = row.customer as { company_name: string; customer_number: string } | null
      const createdBy = row.created_by_profile as { full_name: string } | null
      return {
        name: row.name as string,
        calculation_type: row.calculation_type as string | null,
        customer_name: customer?.company_name || null,
        customer_number: customer?.customer_number || null,
        is_template: row.is_template as boolean,
        total_amount: row.total_amount as number | null,
        final_amount: row.final_amount as number | null,
        created_by_name: createdBy?.full_name || null,
        created_at: row.created_at as string,
      }
    })

    return { success: true, data: flat }
  } catch (err) {
    return { success: false, error: formatError(err, 'Eksport af kalkulationer fejlede') }
  }
}
