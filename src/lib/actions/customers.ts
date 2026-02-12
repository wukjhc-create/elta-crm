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
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'

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
    const { supabase } = await getAuthenticatedClient()
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
    const { supabase } = await getAuthenticatedClient()
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

// Generate next customer number
async function generateCustomerNumber(): Promise<string> {
  const { supabase } = await getAuthenticatedClient()

  const { data } = await supabase
    .from('customers')
    .select('customer_number')
    .order('customer_number', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) {
    return 'C000001'
  }

  const lastNumber = data[0].customer_number
  const numPart = parseInt(lastNumber.substring(1), 10)
  const nextNum = numPart + 1
  return 'C' + nextNum.toString().padStart(6, '0')
}

// Check for duplicate customers by email or company name
export async function checkDuplicateCustomer(
  email: string,
  companyName: string,
  excludeId?: string
): Promise<ActionResult<{ id: string; company_name: string; customer_number: string; email: string }[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

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
    const { supabase, userId } = await getAuthenticatedClient()

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
      tags: [],
      is_active: true,
    }

    const validated = createCustomerSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }
    const customerNumber = await generateCustomerNumber()

    const { data, error } = await supabase
      .from('customers')
      .insert({
        ...validated.data,
        customer_number: customerNumber,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'En kunde med dette kundenummer findes allerede' }
      }
      logger.error('Database error creating customer', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Audit log
    await logCreate('customer', data.id, data.company_name, {
      customer_number: data.customer_number,
    })

    revalidatePath('/customers')
    return { success: true, data: data as Customer }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette kunde') }
  }
}

// Update customer
export async function updateCustomer(formData: FormData): Promise<ActionResult<Customer>> {
  try {
    const { supabase } = await getAuthenticatedClient()

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
    const { supabase } = await getAuthenticatedClient()
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
    const { supabase } = await getAuthenticatedClient()
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
    const { supabase } = await getAuthenticatedClient()
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
    const { supabase } = await getAuthenticatedClient()

    const customerId = formData.get('customer_id') as string
    if (!customerId) {
      return { success: false, error: 'Kunde ID er påkrævet' }
    }
    validateUUID(customerId, 'kunde ID')

    const rawData = {
      customer_id: customerId,
      name: formData.get('name') as string,
      title: formData.get('title') as string || null,
      email: formData.get('email') as string || null,
      phone: formData.get('phone') as string || null,
      mobile: formData.get('mobile') as string || null,
      is_primary: formData.get('is_primary') === 'true',
      notes: formData.get('notes') as string || null,
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
    const { supabase } = await getAuthenticatedClient()

    const id = formData.get('id') as string
    const customerId = formData.get('customer_id') as string

    if (!id) {
      return { success: false, error: 'Kontakt ID mangler' }
    }
    validateUUID(id, 'kontakt ID')

    if (customerId) {
      validateUUID(customerId, 'kunde ID')
    }

    const rawData = {
      id,
      name: formData.get('name') as string,
      title: formData.get('title') as string || null,
      email: formData.get('email') as string || null,
      phone: formData.get('phone') as string || null,
      mobile: formData.get('mobile') as string || null,
      is_primary: formData.get('is_primary') === 'true',
      notes: formData.get('notes') as string || null,
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
    const { supabase } = await getAuthenticatedClient()
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
