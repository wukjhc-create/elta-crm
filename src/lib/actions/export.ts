'use server'

/**
 * Data Export Server Actions
 *
 * Fetches all records (no pagination) for CSV export.
 * Each function returns flat data arrays ready for CSV generation.
 */

import { pgQuote } from '@/lib/validations/postgrest-filter'
import type { ActionResult } from '@/types/common.types'
import { getAuthenticatedClient, formatError, permissionDenied } from '@/lib/actions/action-helpers'
import { sanitizeSearchTerm } from '@/lib/validations/common'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

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
    // Kunde-review: eksporten fejlede ALTID (kolonnen billing_zip findes ikke — den hedder billing_postal_code) og
    // havde ingen gate; .limit(10000) gav højst 1.000 rækker. Nu: gate, rigtig kolonne (alias), side for side.
    const denied = await permissionDenied('customers.view')
    if (denied) return { success: false, error: denied }
    const { supabase } = await getAuthenticatedClient()

    const build = () => {
    let query = supabase
      .from('customers')
      .select('id, customer_number, company_name, contact_person, email, phone, vat_number, billing_address, billing_city, billing_zip:billing_postal_code, is_active, notes, created_at')

    if (filters?.search) {
      const term = `%${sanitizeSearchTerm(filters.search)}%`
      query = query.or(`company_name.ilike.${pgQuote(term)},contact_person.ilike.${pgQuote(term)},email.ilike.${pgQuote(term)}`)
    }

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active)
    }
    return query
    }

    let data: ExportCustomer[]
    try {
      data = await fetchAllRows<ExportCustomer>((from, to) => build().order('created_at', { ascending: false }).order('id').range(from, to) as never, MAX_EXPORT_ROWS)
    } catch {
      return { success: false, error: 'Kunne ikke hente kundedata til eksport' }
    }

    return { success: true, data }
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
    // Kunde-review: eksporten fejlede ALTID (leads.description findes ikke — feltet hedder notes) og havde ingen gate
    // (bogholderi uden leads.view kunne eksportere alle leads). Nu: gate, rigtig kolonne (alias), side for side.
    const denied = await permissionDenied('leads.view')
    if (denied) return { success: false, error: denied }
    const { supabase } = await getAuthenticatedClient()

    const build = () => {
    let query = supabase
      .from('leads')
      .select('id, company_name, contact_person, email, phone, status, source, value, probability, description:notes, assigned_to, created_at')

    if (filters?.search) {
      const term = `%${sanitizeSearchTerm(filters.search)}%`
      query = query.or(`company_name.ilike.${pgQuote(term)},contact_person.ilike.${pgQuote(term)},email.ilike.${pgQuote(term)}`)
    }

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.source) {
      query = query.eq('source', filters.source)
    }
    return query
    }

    let data: Array<Record<string, unknown>>
    try {
      data = await fetchAllRows<Record<string, unknown>>((from, to) => build().order('created_at', { ascending: false }).order('id').range(from, to) as never, MAX_EXPORT_ROWS)
    } catch {
      return { success: false, error: 'Kunne ikke hente leads til eksport' }
    }

    // Kunde-review: join'et profiles!assigned_to findes ikke (ingen FK leads→profiles) — eksporten fejlede derfor altid.
    // Navne slås op separat.
    const assigneeIds = Array.from(new Set(data.map((r) => r.assigned_to).filter((v): v is string => typeof v === 'string')))
    const nameById = new Map<string, string>()
    for (let i = 0; i < assigneeIds.length; i += 200) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', assigneeIds.slice(i, i + 200))
      for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) if (p.full_name) nameById.set(p.id, p.full_name)
    }
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
      assigned_to_name: typeof row.assigned_to === 'string' ? nameById.get(row.assigned_to) ?? null : null,
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
    // Kunde-review: tilbudsbeløb — kun roller med offers.view (før uden gate)
    const denied = await permissionDenied('offers.view')
    if (denied) return { success: false, error: denied }
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('offers')
      .select('offer_number, title, customer:customers!offers_customer_id_fkey(company_name, customer_number), status, total_amount, discount_amount, final_amount, valid_until, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS)

    if (filters?.search) {
      const term = `%${sanitizeSearchTerm(filters.search)}%`
      query = query.or(`title.ilike.${pgQuote(term)},offer_number.ilike.${pgQuote(term)}`)
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
    // D48 (privacy): kost/avance-data — kun economy.cost_prices
    const denied = await permissionDenied('economy.cost_prices')
    if (denied) return { success: false, error: denied }
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('projects')
      .select('project_number, name, customer:customers(company_name, customer_number), status, priority, start_date, end_date, estimated_hours, actual_hours, budget, actual_cost, description, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS)

    if (filters?.search) {
      const term = `%${sanitizeSearchTerm(filters.search)}%`
      query = query.or(`name.ilike.${pgQuote(term)},project_number.ilike.${pgQuote(term)}`)
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
      .select('name, calculation_type, customer:customers(company_name, customer_number), is_template, total_amount:subtotal, final_amount, created_by_profile:profiles!created_by(full_name), created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS)

    if (filters?.search) {
      const term = `%${sanitizeSearchTerm(filters.search)}%`
      query = query.or(`name.ilike.${pgQuote(term)}`)
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
