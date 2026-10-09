'use server'

import { pgQuote } from '@/lib/validations/postgrest-filter'
import { revalidatePath } from 'next/cache'
import {
  createCustomerSchema,
  updateCustomerSchema,
  createCustomerContactSchema,
  updateCustomerContactSchema,
} from '@/lib/validations/customers'
import { validateUUID, sanitizeSearchTerm } from '@/lib/validations/common'
import { logCreate, logUpdate, logDelete, logStatusChange } from '@/lib/actions/audit'
import type {
  Customer,
  CustomerWithRelations,
  CustomerContact,
} from '@/types/customers.types'
import type { PaginatedResponse, ActionResult } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'
import {
  getAuthenticatedClient,
  getAuthenticatedClientWithRole,
  formatError,
} from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'
import { insertCustomerWithRetry } from '@/lib/customers/customer-number'
import type { PaymentFilterKey, PaymentSortKey, PaymentCounts } from '@/app/dashboard/customers/customer-payment-filter'
import type { CustomerPaymentBadge } from '@/lib/actions/invoices'

/**
 * N74: kunder oprettet automatisk fra indgående mail (email-intelligence: tag 'auto-email'; uden e-mail får de en
 * pladsholder @elta-crm.local). Prod 2026-10-04: bl.a. leverandører (signaturens telefon/adresse) — filteret gør dem
 * nemme at gennemgå. PostgREST-or-filter, fælles for liste og tæller.
 */
const AUTO_CREATED_FILTER = 'tags.cs.{auto-email},email.ilike.%@elta-crm.local'

/** N74: antal automatisk oprettede kunder (customers.view). */
export async function countAutoCreatedCustomersAction(): Promise<number> {
  const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('customers.view')) return 0
  const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true }).or(AUTO_CREATED_FILTER)
  return count ?? 0
}

// Get all customers with optional filtering and pagination
export async function getCustomers(filters?: {
  search?: string
  is_active?: boolean
  /** N74: kun automatisk oprettede (fra mail) */
  origin?: 'auto'
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
  /**
   * Sprint Ø4.5 — valgfri global whitelist af customer_ids (fx kunder der
   * matcher et betalingsfilter). Anvendes FØR paginering, så count + sider
   * er korrekte for det filtrerede sæt. Tom liste = nul resultater.
   */
  customerIds?: string[]
  /**
   * Sprint Ø4.6 — forud-pagineret, globalt sorteret id-liste (kun den
   * aktuelle side). Henter netop disse kunder og BEVARER rækkefølgen
   * (ingen DB-sort/range/søgning). `totalOverride` = det fulde filtrerede
   * antal til korrekt pagination.
   */
  preserveOrderIds?: string[]
  totalOverride?: number
}): Promise<ActionResult<PaginatedResponse<CustomerWithRelations>>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view')) {
      return { success: false, error: 'Manglende tilladelse: customers.view' }
    }
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Sprint Ø4.6 — global betalingssortering: hent netop side-slicen og
    // bevar rækkefølgen fra den globalt sorterede id-liste.
    if (filters?.preserveOrderIds !== undefined) {
      const ids = filters.preserveOrderIds
      const total = filters.totalOverride ?? ids.length
      if (ids.length === 0) {
        return { success: true, data: { data: [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) } }
      }
      let q = supabase.from('customers').select(`*, contacts:customer_contacts(*)`).in('id', ids)
      if (filters?.is_active !== undefined) q = q.eq('is_active', filters.is_active)
      const { data, error } = await q
      if (error) {
        logger.error('Database error fetching ordered customers', { error })
        throw new Error('DATABASE_ERROR')
      }
      // Reorder i JS efter den globalt sorterede id-liste (.in bevarer ikke orden).
      const byId = new Map((data ?? []).map((c) => [c.id as string, c]))
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as CustomerWithRelations[]
      return {
        success: true,
        data: { data: ordered, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      }
    }

    // Build count query
    let countQuery = supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })

    // Build data query
    let dataQuery = supabase
      .from('customers')
      .select(`
        *,
        contacts:customer_contacts(*)
      `)

    // Apply filters with sanitized search
    if (filters?.search) {
      const sanitized = sanitizeSearchTerm(filters.search)
      const searchFilter = `company_name.ilike.${pgQuote(`%${sanitized}%`)},contact_person.ilike.${pgQuote(`%${sanitized}%`)},email.ilike.${pgQuote(`%${sanitized}%`)},customer_number.ilike.${pgQuote(`%${sanitized}%`)}`
      countQuery = countQuery.or(searchFilter)
      dataQuery = dataQuery.or(searchFilter)
    }

    if (filters?.is_active !== undefined) {
      countQuery = countQuery.eq('is_active', filters.is_active)
      dataQuery = dataQuery.eq('is_active', filters.is_active)
    }

    if (filters?.origin === 'auto') {
      countQuery = countQuery.or(AUTO_CREATED_FILTER)
      dataQuery = dataQuery.or(AUTO_CREATED_FILTER)
    }

    // Sprint Ø4.5 — global whitelist (betalingsfilter). Tom liste → nul rækker.
    if (filters?.customerIds !== undefined) {
      countQuery = countQuery.in('id', filters.customerIds)
      dataQuery = dataQuery.in('id', filters.customerIds)
    }

    // Apply sorting
    const sortBy = safeCustomerSort(filters?.sortBy)
    const sortOrder = filters?.sortOrder || 'desc'
    dataQuery = dataQuery.order(sortBy, { ascending: sortOrder === 'asc' })

    // Apply pagination
    dataQuery = dataQuery.range(offset, offset + pageSize - 1)

    // Execute both queries
    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

    if (countResult.error) {
      logger.error('Database error counting customers', { error: countResult.error })
      throw new Error('DATABASE_ERROR')
    }

    if (dataResult.error) {
      logger.error('Database error fetching customers', { error: dataResult.error })
      throw new Error('DATABASE_ERROR')
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: dataResult.data as CustomerWithRelations[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kunder') }
  }
}

// =====================================================
// Sprint Ø4.9 — Kundeliste med betalingsstatus via SQL-view
//
// Bruger v_customers_with_payment_summary (customers JOIN cost-free
// betalingsaggregat). Søgning + betalingsfilter + global betalingssortering
// + paginering sker ALT i SQL → globalt korrekt, ingen limit 20000, ingen
// N+1. Tællere via 5 lette COUNT-queries (respekterer søgning).
// Gated customers.view + invoices.view.own_cases.
// =====================================================

interface PaymentListInput {
  search?: string
  is_active?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
  payment?: PaymentFilterKey
  paysort?: PaymentSortKey
  /** N74: kun automatisk oprettede (fra mail) */
  origin?: 'auto'
}

export interface CustomersWithPaymentState {
  data: CustomerWithRelations[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  badges: Record<string, CustomerPaymentBadge>
  counts: PaymentCounts
}

const PAYMENT_BADGE_LABEL: Record<string, string> = {
  requires_attention: 'Forfaldne',
  late_payer: 'Ofte forsinket',
  on_time: 'Betaler til tiden',
  no_data: 'Ingen betalingshistorik',
}

export async function getCustomersWithPaymentState(
  input?: PaymentListInput
): Promise<ActionResult<CustomersWithPaymentState>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view')) {
      return { success: false, error: 'Manglende tilladelse: customers.view' }
    }
    if (!hasPermission('invoices.view.own_cases')) {
      return { success: false, error: 'Manglende tilladelse: invoices.view.own_cases' }
    }

    const page = input?.page || 1
    const pageSize = input?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize
    const payment = input?.payment ?? 'all'
    const paysort = input?.paysort ?? 'default'
    const VIEW = 'v_customers_with_payment_summary'

    // Fælles WHERE-bygger (søgning + kundestatus + valgfrit betalingsfilter).
    const searchFilter = input?.search
      ? (() => {
          const s = sanitizeSearchTerm(input.search!)
          return `company_name.ilike.${pgQuote(`%${s}%`)},contact_person.ilike.${pgQuote(`%${s}%`)},email.ilike.${pgQuote(`%${s}%`)},customer_number.ilike.${pgQuote(`%${s}%`)}`
        })()
      : null

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const applyFilters = (q: any, withPaymentFilter: boolean): any => {
      let out = q
      if (searchFilter) out = out.or(searchFilter)
      if (input?.is_active !== undefined) out = out.eq('is_active', input.is_active)
      if (input?.origin === 'auto') out = out.or(AUTO_CREATED_FILTER)
      if (withPaymentFilter) {
        if (payment === 'overdue') out = out.gt('overdue_count', 0)
        else if (payment === 'outstanding') out = out.gt('outstanding_total', 0)
        else if (payment === 'late_payer') out = out.eq('payment_status', 'late_payer')
        else if (payment === 'on_time') out = out.eq('payment_status', 'on_time')
        else if (payment === 'no_data') out = out.eq('payment_status', 'no_data')
      }
      return out
    }

    // Hoved-query: rækker + total (count) for det filtrerede sæt.
    let dataQuery = applyFilters(
      supabase.from(VIEW).select('*, contacts:customer_contacts(*)', { count: 'exact' }),
      true
    )

    // Sortering — global betalingssortering har forrang; ellers kunde-sort.
    if (paysort === 'outstanding_desc') dataQuery = dataQuery.order('outstanding_total', { ascending: false })
    else if (paysort === 'overdue_desc')
      dataQuery = dataQuery.order('overdue_count', { ascending: false }).order('overdue_total', { ascending: false })
    else if (paysort === 'latest_invoice_desc')
      dataQuery = dataQuery.order('latest_invoice_at', { ascending: false, nullsFirst: false })
    else if (paysort === 'payment_health') dataQuery = dataQuery.order('health_rank', { ascending: false })
    else dataQuery = dataQuery.order(safeCustomerSort(input?.sortBy), { ascending: (input?.sortOrder || 'desc') === 'asc' })
    dataQuery = dataQuery.order('id', { ascending: true }) // stabil paginering
    dataQuery = dataQuery.range(offset, offset + pageSize - 1)

    // Tællere — 5 lette COUNT-queries (head), respekterer søgning + kundestatus.
    const countQ = (predicate: (q: any) => any) =>
      predicate(applyFilters(supabase.from(VIEW).select('id', { count: 'exact', head: true }), false))

    const [dataRes, cOverdue, cOutstanding, cLate, cOnTime, cNoData] = await Promise.all([
      dataQuery,
      countQ((q) => q.gt('overdue_count', 0)),
      countQ((q) => q.gt('outstanding_total', 0)),
      countQ((q) => q.eq('payment_status', 'late_payer')),
      countQ((q) => q.eq('payment_status', 'on_time')),
      countQ((q) => q.eq('payment_status', 'no_data')),
    ])

    if (dataRes.error) {
      logger.error('getCustomersWithPaymentState: query failed', { error: dataRes.error })
      throw new Error('DATABASE_ERROR')
    }

    const rows = (dataRes.data ?? []) as Array<Record<string, unknown>>
    const total = dataRes.count || 0
    const data = rows as unknown as CustomerWithRelations[]

    const badges: Record<string, CustomerPaymentBadge> = {}
    for (const r of rows) {
      const status = (r.payment_status as string) ?? 'no_data'
      badges[r.id as string] = {
        outstanding_total: Number(r.outstanding_total ?? 0),
        overdue_count: Number(r.overdue_count ?? 0),
        overdue_total: Number(r.overdue_total ?? 0),
        status: status as CustomerPaymentBadge['status'],
        human_label: PAYMENT_BADGE_LABEL[status] ?? 'Ingen betalingshistorik',
      }
    }

    const counts: PaymentCounts = {
      overdue: cOverdue.count || 0,
      outstanding: cOutstanding.count || 0,
      late_payer: cLate.count || 0,
      on_time: cOnTime.count || 0,
      no_data: cNoData.count || 0,
    }

    return {
      success: true,
      data: { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize), badges, counts },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kunder med betalingsstatus') }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Get single customer by ID
export async function getCustomer(id: string): Promise<ActionResult<CustomerWithRelations>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view')) {
      return { success: false, error: 'Manglende tilladelse: customers.view' }
    }
    validateUUID(id, 'kunde ID')

    const { data, error } = await supabase
      .from('customers')
      .select(`
        *,
        contacts:customer_contacts(*)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      logger.error('Database error fetching customer', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!data) {
      return { success: false, error: 'Kunden blev ikke fundet' }
    }

    return { success: true, data: data as CustomerWithRelations }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kunde') }
  }
}

// Sprint 9E Phase 5d: lokal generateCustomerNumber er fjernet til fordel
// for faelles helper i src/lib/customers/customer-number.ts.
// insertCustomerWithRetry haandterer baade generation, insert og retry
// ved 23505 unique violation. Se helper-modulet for detaljer.

// Check for duplicate customers by email or company name
export async function checkDuplicateCustomer(
  email: string,
  companyName: string,
  excludeId?: string
): Promise<ActionResult<{ id: string; company_name: string; customer_number: string; email: string }[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.create')) {
      return { success: false, error: 'Manglende tilladelse: customers.create' }
    }

    let query = supabase
      .from('customers')
      .select('id, company_name, customer_number, email')
      .or(`email.ilike.${pgQuote(sanitizeSearchTerm(email))},company_name.ilike.${pgQuote(sanitizeSearchTerm(companyName))}`)
      .limit(5)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { data, error } = await query
    if (error) {
      return { success: false, error: 'Kunne ikke tjekke for dubletter' }
    }
    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Fejl ved dublet-tjek') }
  }
}

// Create new customer
export async function createCustomer(formData: FormData): Promise<ActionResult<Customer>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.create')) {
      return { success: false, error: 'Manglende tilladelse: customers.create' }
    }

    const rawData = {
      company_name: formData.get('company_name') as string,
      contact_person: formData.get('contact_person') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string || null,
      mobile: formData.get('mobile') as string || null,
      website: formData.get('website') as string || null,
      vat_number: formData.get('vat_number') as string || null,
      billing_address: formData.get('billing_address') as string || null,
      billing_city: formData.get('billing_city') as string || null,
      billing_postal_code: formData.get('billing_postal_code') as string || null,
      billing_country: formData.get('billing_country') as string || 'Danmark',
      shipping_address: formData.get('shipping_address') as string || null,
      shipping_city: formData.get('shipping_city') as string || null,
      shipping_postal_code: formData.get('shipping_postal_code') as string || null,
      shipping_country: formData.get('shipping_country') as string || 'Danmark',
      notes: formData.get('notes') as string || null,
      payment_terms_days: formData.get('payment_terms_days')
        ? Number(formData.get('payment_terms_days'))
        : null,
      tags: [],
      is_active: true,
    }

    const validated = createCustomerSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }
    // Sprint 9E Phase 5d: bruger faelles insertCustomerWithRetry-helper.
    // Generation + insert + retry mod 23505 sker i ét kald.
    const { data: inserted, error } = await insertCustomerWithRetry<Customer>(
      supabase,
      (customerNumber) => ({
        ...validated.data,
        customer_number: customerNumber,
        created_by: userId,
      }),
      { label: 'createCustomer' }
    )

    if (!inserted || error) {
      if (error?.code === '23505') {
        logger.error('createCustomer exhausted retries', { metadata: { code: error.code } })
        return {
          success: false,
          error: 'Kunne ikke generere et unikt kundenummer. Proev igen om lidt.',
        }
      }
      logger.error('Database error creating customer', { error })
      throw new Error('DATABASE_ERROR')
    }

    // Bugfix Sprint 9E Phase 5d-fix: defensiv re-fetch ved manglende felter.
    let customer: Customer = inserted
    if (!inserted.id || !inserted.company_name || !inserted.customer_number) {
      logger.warn('createCustomer insufficient data — re-fetching', {
        metadata: {
          has_id: !!inserted.id,
          has_company_name: !!inserted.company_name,
          has_customer_number: !!inserted.customer_number,
        },
      })
      if (inserted.id) {
        const { data: refreshed } = await supabase
          .from('customers')
          .select('*')
          .eq('id', inserted.id)
          .single()
        if (refreshed) customer = refreshed as Customer
      } else {
        logger.error('createCustomer: no id returned from insert', { error })
        return {
          success: false,
          error: 'Kunden blev muligvis oprettet, men data mangler. Genindlæs siden.',
        }
      }
    }

    await logCreate('customer', customer.id, customer.company_name, {
      customer_number: customer.customer_number,
    })
    // N24a: tidligere mails fra kundens adresse kobles til den nye kunde
    {
      const { linkUnlinkedEmailsFromAddress } = await import('@/lib/mail/retro-link')
      await linkUnlinkedEmailsFromAddress(supabase, customer.id, customer.email)
    }
    revalidatePath('/customers')
    return { success: true, data: customer }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette kunde') }
  }
}

/**
 * Sprint 9E Phase 5a — quick-create customer fra opret-sag-flow.
 *
 * Tager et plain JSON-objekt (i stedet for FormData) saa modal-callers
 * kan kalde det direkte fra klient-state. Genbruger createCustomerSchema
 * via Zod-validation og samme insert/audit-pattern som createCustomer.
 *
 * Type-haandtering:
 *  - customer_type = 'private': navn mappes til BAADE company_name og
 *    contact_person; vat_number tvinges til null.
 *  - customer_type = 'business': separate firmanavn + kontaktperson +
 *    valgfri CVR.
 */
export interface QuickCreateCustomerInput {
  customer_type: 'private' | 'business'
  /** Privat: fulde navn. Erhverv: firmanavn. */
  primary_name: string
  /** Erhverv: kontaktperson. Privat: bruges ikke (samme som primary_name). */
  contact_person?: string | null
  email: string
  phone?: string | null
  mobile?: string | null
  /** Erhverv: CVR-nummer. Privat: ignoreres. */
  vat_number?: string | null
  /** Sprint 9E Phase 5b — erhverv hjemmeside. Privat: ignoreres. */
  website?: string | null
  billing_address?: string | null
  billing_postal_code?: string | null
  billing_city?: string | null
  /** Sprint 9E Phase 5b — separat leveringsadresse (full-mode). */
  shipping_address?: string | null
  shipping_postal_code?: string | null
  shipping_city?: string | null
  shipping_country?: string | null
  /** Sprint 9E Phase 5b — interne noter (full-mode). */
  notes?: string | null
}

export async function quickCreateCustomer(
  input: QuickCreateCustomerInput
): Promise<ActionResult<Customer>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.create')) {
      return { success: false, error: 'Manglende tilladelse: customers.create' }
    }

    const isPrivate = input.customer_type === 'private'
    const primaryName = (input.primary_name || '').trim()
    if (!primaryName) {
      return { success: false, error: isPrivate ? 'Navn er paakraevet' : 'Firmanavn er paakraevet' }
    }
    const contactPerson = isPrivate
      ? primaryName
      : (input.contact_person || '').trim()
    if (!contactPerson) {
      return { success: false, error: 'Kontaktperson er paakraevet' }
    }

    const rawData = {
      company_name: primaryName,
      contact_person: contactPerson,
      email: (input.email || '').trim(),
      phone: input.phone?.trim() || null,
      mobile: input.mobile?.trim() || null,
      // Sprint 9E Phase 5b — website kun for erhverv
      website: isPrivate ? null : (input.website?.trim() || null),
      vat_number: isPrivate ? null : (input.vat_number?.trim() || null),
      billing_address: input.billing_address?.trim() || null,
      billing_city: input.billing_city?.trim() || null,
      billing_postal_code: input.billing_postal_code?.trim() || null,
      billing_country: 'Danmark',
      // Sprint 9E Phase 5b — separat leveringsadresse (full-mode)
      shipping_address: input.shipping_address?.trim() || null,
      shipping_city: input.shipping_city?.trim() || null,
      shipping_postal_code: input.shipping_postal_code?.trim() || null,
      shipping_country: input.shipping_country?.trim() || 'Danmark',
      notes: input.notes?.trim() || null,
      tags: [],
      is_active: true,
    }

    const validated = createCustomerSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    // Sprint 9E Phase 5d: bruger faelles insertCustomerWithRetry-helper.
    const { data: inserted, error } = await insertCustomerWithRetry<Customer>(
      supabase,
      (customerNumber) => ({
        ...validated.data,
        customer_number: customerNumber,
        created_by: userId,
      }),
      { label: 'quickCreateCustomer' }
    )

    if (!inserted || error) {
      if (error?.code === '23505') {
        logger.error('quickCreateCustomer exhausted retries', { metadata: { code: error.code } })
        return {
          success: false,
          error: 'Kunne ikke generere et unikt kundenummer. Proev igen om lidt.',
        }
      }
      logger.error('Database error in quickCreateCustomer', { error })
      return { success: false, error: 'Kunne ikke oprette kunde' }
    }

    // Bugfix Sprint 9E Phase 5d-fix: defensiv re-fetch hvis helper-resultatet
    // mangler vigtige felter. Sikrer at dialog/auto-select altid har fuld
    // customer-row med id, company_name, contact_person, customer_number, email.
    let customer: Customer = inserted
    if (!inserted.id || !inserted.company_name || !inserted.customer_number) {
      logger.warn('quickCreateCustomer insufficient data — re-fetching', {
        metadata: {
          has_id: !!inserted.id,
          has_company_name: !!inserted.company_name,
          has_customer_number: !!inserted.customer_number,
        },
      })
      if (inserted.id) {
        const { data: refreshed } = await supabase
          .from('customers')
          .select('*')
          .eq('id', inserted.id)
          .single()
        if (refreshed) customer = refreshed as Customer
      } else {
        logger.error('quickCreateCustomer: no id returned from insert', { error })
        return {
          success: false,
          error: 'Kunden blev muligvis oprettet, men data mangler. Genindlæs siden.',
        }
      }
    }

    await logCreate('customer', customer.id, customer.company_name, {
      customer_number: customer.customer_number,
      customer_type: input.customer_type,
      source: 'quick_create',
    })
    {
      const { linkUnlinkedEmailsFromAddress } = await import('@/lib/mail/retro-link')
      await linkUnlinkedEmailsFromAddress(supabase, customer.id, customer.email)
    }
    revalidatePath('/dashboard/customers')
    return { success: true, data: customer }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette kunde') }
  }
}

// Update customer
export async function updateCustomer(formData: FormData): Promise<ActionResult<Customer>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.edit')) {
      return { success: false, error: 'Manglende tilladelse: customers.edit' }
    }

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Kunde ID mangler' }
    }
    validateUUID(id, 'kunde ID')

    const rawData = {
      id,
      company_name: formData.get('company_name') as string,
      contact_person: formData.get('contact_person') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string || null,
      mobile: formData.get('mobile') as string || null,
      website: formData.get('website') as string || null,
      vat_number: formData.get('vat_number') as string || null,
      billing_address: formData.get('billing_address') as string || null,
      billing_city: formData.get('billing_city') as string || null,
      billing_postal_code: formData.get('billing_postal_code') as string || null,
      billing_country: formData.get('billing_country') as string || null,
      shipping_address: formData.get('shipping_address') as string || null,
      shipping_city: formData.get('shipping_city') as string || null,
      shipping_postal_code: formData.get('shipping_postal_code') as string || null,
      shipping_country: formData.get('shipping_country') as string || null,
      notes: formData.get('notes') as string || null,
      payment_terms_days: formData.get('payment_terms_days')
        ? Number(formData.get('payment_terms_days'))
        : null,
      is_active: formData.get('is_active') === 'true',
    }

    const validated = updateCustomerSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const { id: customerId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', customerId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Kunden blev ikke fundet' }
      }
      logger.error('Database error updating customer', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Audit log - log what fields changed
    const changes: Record<string, { old: unknown; new: unknown }> = {}
    Object.keys(updateData).forEach((key) => {
      const newVal = updateData[key as keyof typeof updateData]
      if (newVal !== undefined) {
        changes[key] = { old: 'previous', new: newVal }
      }
    })
    await logUpdate('customer', customerId, data.company_name, changes)

    revalidatePath('/customers')
    // N24a: ny/ændret mailadresse → kobl tidligere ukoblede mails fra adressen
    if ((data as Customer | null)?.email) {
      const { linkUnlinkedEmailsFromAddress } = await import('@/lib/mail/retro-link')
      await linkUnlinkedEmailsFromAddress(supabase, customerId, (data as Customer).email)
    }
    revalidatePath(`/customers/${customerId}`)
    return { success: true, data: data as Customer }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere kunde') }
  }
}

// Delete customer
export async function deleteCustomer(id: string): Promise<ActionResult> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.delete')) {
      return { success: false, error: 'Manglende tilladelse: customers.delete' }
    }
    validateUUID(id, 'kunde ID')

    // Get customer name before deleting for audit log
    const { data: customer } = await supabase
      .from('customers')
      .select('company_name, customer_number')
      .eq('id', id)
      .maybeSingle()

    // Kunde-review (HØJ): offers.customer_id er ON DELETE CASCADE → sletning fjernede stille tilbud, UNDERSKRIFTER,
    // portal-links og dokumenter, mens fakturaer og sager blev efterladt uden kunde. 23503-beskeden nåede man aldrig.
    // Kunder med tilbud, fakturaer eller sager kan derfor ikke slettes — de deaktiveres. Optælling med admin-klienten,
    // så RLS ikke skjuler rækker (kun antal).
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    // Kunde-/leads-review 2026-10-07: også projekter, dokumenter (storage-filer blev efterladt), opgaver og portal-
    // beskeder kaskaderede stille → de blokerer nu også sletning
    const cnt = (table: string) => admin.from(table).select('id', { count: 'exact', head: true }).eq('customer_id', id)
    const [offersRes, invoicesRes, casesRes, projectsRes, docsRes, tasksRes, portalRes] = await Promise.all([
      cnt('offers'), cnt('invoices'), cnt('service_cases'), cnt('projects'), cnt('customer_documents'), cnt('customer_tasks'), cnt('portal_messages'),
    ])
    if ([offersRes, invoicesRes, casesRes, projectsRes, docsRes, tasksRes, portalRes].some((r) => r.error)) throw new Error('DATABASE_ERROR')
    const linked = [
      offersRes.count ? `${offersRes.count} tilbud` : '',
      invoicesRes.count ? `${invoicesRes.count} faktura${invoicesRes.count === 1 ? '' : 'er'}` : '',
      casesRes.count ? `${casesRes.count} sag${casesRes.count === 1 ? '' : 'er'}` : '',
      projectsRes.count ? `${projectsRes.count} projekt${projectsRes.count === 1 ? '' : 'er'}` : '',
      docsRes.count ? `${docsRes.count} dokument${docsRes.count === 1 ? '' : 'er'}` : '',
      tasksRes.count ? `${tasksRes.count} opgave${tasksRes.count === 1 ? '' : 'r'}` : '',
      portalRes.count ? `${portalRes.count} portalbesked${portalRes.count === 1 ? '' : 'er'}` : '',
    ].filter(Boolean)
    // Kunde-review 2026-10-08 (#2): også data der ellers forsvandt/blev tømt stille — kundens rolle på ANDRES sager/tilbud
    // (bestiller/slutkunde/betaler/købt-fra/anlægsadresse), noter, tagtegninger, mailtråde, partneradgang og prisaftaler.
    // Tabeller der ikke findes i miljøet (fx customer_notes før 00196) tæller som 0.
    // Kunde-review 2026-10-09 (#4): KUN "tabel/kolonne findes ikke" tæller som 0 — andre fejl (timeout o.l.) afviser
    // sletningen (før blev enhver fejl til 0, og sletningen kaskadede noter/tegninger/prisaftaler væk)
    const optionalCount = async (table: string, column = 'customer_id') => {
      const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true }).eq(column, id)
      if (!error) return count ?? 0
      // HEAD-svar har ingen fejlkode → gentag som almindelig forespørgsel for at se, om tabellen/kolonnen mangler
      const probe = await admin.from(table).select('id').eq(column, id).limit(1)
      if (!probe.error) return (probe.data ?? []).length
      if (['42P01', 'PGRST205', '42703', 'PGRST204'].includes(String(probe.error.code ?? ''))) return 0
      throw new Error('Kunne ikke kontrollere kundens tilknytninger — prøv igen')
    }
    const roleRefs = await Promise.all([
      ...['site_customer_id', 'orderer_customer_id', 'end_customer_id', 'payer_customer_id', 'purchased_from_customer_id'].map((c) => optionalCount('service_cases', c)),
      ...['orderer_customer_id', 'end_customer_id', 'payer_customer_id'].map((c) => optionalCount('offers', c)),
    ])
    const [notesN, roofN, threadsN, partnerN, cspN, cppN, marginN, invRoleN] = await Promise.all([
      optionalCount('customer_notes'), optionalCount('roof_drawings'), optionalCount('email_threads'),
      optionalCount('partner_access_tokens', 'partner_customer_id'), optionalCount('customer_supplier_prices'), optionalCount('customer_product_prices'),
      // kunde-review 2026-10-09 (#4): kundens avanceregler (ON DELETE CASCADE) og parti-roller på fakturaer (SET NULL)
      optionalCount('supplier_margin_rules'),
      Promise.all(['orderer_customer_id', 'end_customer_id', 'payer_customer_id'].map((c) => optionalCount('invoices', c))).then((a) => a.reduce((x, y) => x + y, 0)),
    ])
    const roleN = roleRefs.reduce((a, b) => a + b, 0)
    linked.push(...[
      roleN ? `en rolle på ${roleN} sag(er)/tilbud (bestiller/slutkunde/betaler)` : '',
      notesN ? `${notesN} note${notesN === 1 ? '' : 'r'}` : '',
      roofN ? `${roofN} tagtegning${roofN === 1 ? '' : 'er'}` : '',
      threadsN ? `${threadsN} mailtråd${threadsN === 1 ? '' : 'e'}` : '',
      partnerN ? 'partneradgang' : '',
      cspN || cppN || marginN ? 'prisaftaler' : '',
      invRoleN ? `en rolle på ${invRoleN} faktura(er)` : '',
    ].filter(Boolean))
    if (linked.length) {
      return { success: false, error: `Kunden har ${linked.join(', ')} og kan ikke slettes — deaktivér kunden i stedet` }
    }

    const { error } = await supabase.from('customers').delete().eq('id', id)

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Kunden kan ikke slettes da den har tilknyttede tilbud eller kontakter' }
      }
      logger.error('Database error deleting customer', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Audit log
    await logDelete('customer', id, customer?.company_name || 'Ukendt', {
      customer_number: customer?.customer_number,
    })

    revalidatePath('/customers')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette kunde') }
  }
}

// Toggle customer active status
export async function toggleCustomerActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<Customer>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.edit')) {
      return { success: false, error: 'Manglende tilladelse: customers.edit' }
    }
    validateUUID(id, 'kunde ID')

    const { data, error } = await supabase
      .from('customers')
      .update({ is_active: isActive })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Kunden blev ikke fundet' }
      }
      logger.error('Database error toggling customer status', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Audit log
    await logStatusChange(
      'customer',
      id,
      data.company_name,
      isActive ? 'inactive' : 'active',
      isActive ? 'active' : 'inactive'
    )

    revalidatePath('/customers')
    revalidatePath(`/customers/${id}`)
    return { success: true, data: data as Customer }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke ændre kundestatus') }
  }
}

// ==================== Customer Contacts ====================

// Get customer contacts
export async function getCustomerContacts(
  customerId: string
): Promise<ActionResult<CustomerContact[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view')) {
      return { success: false, error: 'Manglende tilladelse: customers.view' }
    }
    validateUUID(customerId, 'kunde ID')

    const { data, error } = await supabase
      .from('customer_contacts')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_primary', { ascending: false })
      .order('name')

    if (error) {
      logger.error('Database error fetching customer contacts', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as CustomerContact[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kontakter') }
  }
}

// Create customer contact
export async function createCustomerContact(
  formData: FormData
): Promise<ActionResult<CustomerContact>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.edit')) {
      return { success: false, error: 'Manglende tilladelse: customers.edit' }
    }

    const customerId = formData.get('customer_id') as string
    if (!customerId) {
      return { success: false, error: 'Kunde ID er påkrævet' }
    }
    validateUUID(customerId, 'kunde ID')

    const rawRole = (formData.get('role') as string) || ''
    const rawData = {
      customer_id: customerId,
      name: formData.get('name') as string,
      title: formData.get('title') as string || null,
      email: formData.get('email') as string || null,
      phone: formData.get('phone') as string || null,
      mobile: formData.get('mobile') as string || null,
      is_primary: formData.get('is_primary') === 'true',
      notes: formData.get('notes') as string || null,
      // Sprint 8G+2: kontaktrolle — tom streng → null
      role: rawRole.trim().length > 0 ? rawRole : null,
    }

    const validated = createCustomerContactSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const { data, error } = await supabase
      .from('customer_contacts')
      .insert(validated.data)
      .select()
      .single()

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Kunden findes ikke' }
      }
      logger.error('Database error creating customer contact', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Kunde-review 2026-10-08 (#6): de andre kontakter mister "primær" først EFTER en vellykket oprettelse (før: nulstil
    // først → fejlede indsættelsen, havde kunden ingen primær kontakt)
    if (validated.data.is_primary) {
      await supabase
        .from('customer_contacts')
        .update({ is_primary: false })
        .eq('customer_id', validated.data.customer_id)
        .neq('id', (data as { id: string }).id)
    }

    revalidatePath(`/customers/${validated.data.customer_id}`)
    return { success: true, data: data as CustomerContact }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette kontakt') }
  }
}

// Update customer contact
export async function updateCustomerContact(
  formData: FormData
): Promise<ActionResult<CustomerContact>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.edit')) {
      return { success: false, error: 'Manglende tilladelse: customers.edit' }
    }

    const id = formData.get('id') as string
    const customerId = formData.get('customer_id') as string

    if (!id) {
      return { success: false, error: 'Kontakt ID mangler' }
    }
    validateUUID(id, 'kontakt ID')

    if (customerId) {
      validateUUID(customerId, 'kunde ID')
    }

    const rawRole = (formData.get('role') as string) || ''
    const rawData = {
      id,
      name: formData.get('name') as string,
      title: formData.get('title') as string || null,
      email: formData.get('email') as string || null,
      phone: formData.get('phone') as string || null,
      mobile: formData.get('mobile') as string || null,
      is_primary: formData.get('is_primary') === 'true',
      notes: formData.get('notes') as string || null,
      // Sprint 8G+2: kontaktrolle — tom streng → null
      role: rawRole.trim().length > 0 ? rawRole : null,
    }

    const validated = updateCustomerContactSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    // Kunde-review 2026-10-08 (#6): kundens id læses fra kontakten selv (før klientens customer_id — manglede den,
    // blev nulstillingen sprunget over → to primære kontakter)
    const { data: own } = await supabase.from('customer_contacts').select('customer_id').eq('id', id).maybeSingle()
    const ownCustomerId = (own as { customer_id: string } | null)?.customer_id ?? null
    if (validated.data.is_primary && ownCustomerId) {
      await supabase
        .from('customer_contacts')
        .update({ is_primary: false })
        .eq('customer_id', ownCustomerId)
        .neq('id', id)
    }

    const { id: contactId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('customer_contacts')
      .update(updateData)
      .eq('id', contactId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Kontakten blev ikke fundet' }
      }
      logger.error('Database error updating customer contact', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/customers/${customerId}`)
    return { success: true, data: data as CustomerContact }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere kontakt') }
  }
}

// Delete customer contact
export async function deleteCustomerContact(
  id: string,
  customerId: string
): Promise<ActionResult> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.edit')) {
      return { success: false, error: 'Manglende tilladelse: customers.edit' }
    }
    validateUUID(id, 'kontakt ID')
    validateUUID(customerId, 'kunde ID')

    const { error } = await supabase
      .from('customer_contacts')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting customer contact', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette kontakt') }
  }
}

// =====================================================
// Søgbar kundevælger (N14) — serversøgning i stedet for at hente ALLE kunder til en <select>
// (Supabase-loft på 1.000 rækker ville stille skjule kunder; en lang liste er også tung at bruge).
// =====================================================

export interface CustomerPickerItem { id: string; customer_number: string | null; company_name: string; contact_person: string | null; email: string | null }

export async function searchCustomersForPickerAction(query: string): Promise<ActionResult<CustomerPickerItem[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view')) return { success: false, error: 'Manglende tilladelse: customers.view' }
    const term = String(query ?? '').trim().slice(0, 100)
    let q = supabase.from('customers').select('id, customer_number, company_name, contact_person, email')
      .eq('is_active', true).order('company_name').limit(12)
    if (term) {
      const { orIlikeContains } = await import('@/lib/validations/postgrest-filter')
      q = q.or(orIlikeContains(['company_name', 'contact_person', 'email', 'customer_number'], term))
    }
    const { data, error } = await q
    if (error) return { success: false, error: 'Søgning fejlede' }
    return { success: true, data: (data ?? []) as CustomerPickerItem[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Søgning fejlede') }
  }
}

export async function getCustomerPickerItemAction(id: string): Promise<ActionResult<CustomerPickerItem | null>> {
  try {
    validateUUID(id, 'kunde ID')
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view')) return { success: false, error: 'Manglende tilladelse: customers.view' }
    const { data } = await supabase.from('customers').select('id, customer_number, company_name, contact_person, email').eq('id', id).maybeSingle()
    return { success: true, data: (data as CustomerPickerItem | null) ?? null }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kunde') }
  }
}

/** Kunde-review 2026-10-09 (#8): kun kendte sorteringskolonner fra URL'en (ellers fejl/vilkårlig kolonne). */
function safeCustomerSort(sortBy: string | undefined): string {
  const allowed = ['created_at', 'updated_at', 'company_name', 'contact_person', 'customer_number', 'email', 'billing_city', 'is_active']
  return sortBy && allowed.includes(sortBy) ? sortBy : 'created_at'
}
