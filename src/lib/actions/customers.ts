'use server'

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

// Get all customers with optional filtering and pagination
export async function getCustomers(filters?: {
  search?: string
  is_active?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}): Promise<ActionResult<PaginatedResponse<CustomerWithRelations>>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view')) {
      return { success: false, error: 'Manglende tilladelse: customers.view' }
    }
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

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
      const searchFilter = `company_name.ilike.%${sanitized}%,contact_person.ilike.%${sanitized}%,email.ilike.%${sanitized}%,customer_number.ilike.%${sanitized}%`
      countQuery = countQuery.or(searchFilter)
      dataQuery = dataQuery.or(searchFilter)
    }

    if (filters?.is_active !== undefined) {
      countQuery = countQuery.eq('is_active', filters.is_active)
      dataQuery = dataQuery.eq('is_active', filters.is_active)
    }

    // Apply sorting
    const sortBy = filters?.sortBy || 'created_at'
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
      .or(`email.ilike.${sanitizeSearchTerm(email)},company_name.ilike.${sanitizeSearchTerm(companyName)}`)
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

    // If this contact is primary, unset any existing primary contact
    if (validated.data.is_primary) {
      await supabase
        .from('customer_contacts')
        .update({ is_primary: false })
        .eq('customer_id', validated.data.customer_id)
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

    // If this contact is primary, unset any existing primary contact
    if (validated.data.is_primary && customerId) {
      await supabase
        .from('customer_contacts')
        .update({ is_primary: false })
        .eq('customer_id', customerId)
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
