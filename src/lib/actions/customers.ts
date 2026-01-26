'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import {
  createCustomerSchema,
  updateCustomerSchema,
  createCustomerContactSchema,
  updateCustomerContactSchema,
} from '@/lib/validations/customers'
import type {
  Customer,
  CustomerWithRelations,
  CustomerContact,
} from '@/types/customers.types'
import type { PaginatedResponse } from '@/types/common.types'

export interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

const DEFAULT_PAGE_SIZE = 25

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
    const supabase = await createClient()
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
        contacts:customer_contacts(*),
        created_by_profile:profiles!customers_created_by_fkey(id, full_name, email)
      `)

    // Apply filters to both queries
    if (filters?.search) {
      const searchFilter = `company_name.ilike.%${filters.search}%,contact_person.ilike.%${filters.search}%,email.ilike.%${filters.search}%,customer_number.ilike.%${filters.search}%`
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
      console.error('Error counting customers:', countResult.error)
      return { success: false, error: 'Kunne ikke hente kunder' }
    }

    if (dataResult.error) {
      console.error('Error fetching customers:', dataResult.error)
      return { success: false, error: 'Kunne ikke hente kunder' }
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
  } catch (error) {
    console.error('Error in getCustomers:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get single customer by ID
export async function getCustomer(id: string): Promise<ActionResult<CustomerWithRelations>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('customers')
      .select(`
        *,
        contacts:customer_contacts(*),
        created_by_profile:profiles!customers_created_by_fkey(id, full_name, email)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching customer:', error)
      return { success: false, error: 'Kunne ikke hente kunde' }
    }

    return { success: true, data: data as CustomerWithRelations }
  } catch (error) {
    console.error('Error in getCustomer:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Generate next customer number
async function generateCustomerNumber(): Promise<string> {
  const supabase = await createClient()

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

// Create new customer
export async function createCustomer(formData: FormData): Promise<ActionResult<Customer>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
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
      tags: [],
      is_active: true,
    }

    const validated = createCustomerSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const customerNumber = await generateCustomerNumber()

    const { data, error } = await supabase
      .from('customers')
      .insert({
        ...validated.data,
        customer_number: customerNumber,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating customer:', error)
      return { success: false, error: 'Kunne ikke oprette kunde' }
    }

    revalidatePath('/customers')
    return { success: true, data: data as Customer }
  } catch (error) {
    console.error('Error in createCustomer:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update customer
export async function updateCustomer(formData: FormData): Promise<ActionResult<Customer>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Kunde ID mangler' }
    }

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

    const supabase = await createClient()

    const { id: customerId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', customerId)
      .select()
      .single()

    if (error) {
      console.error('Error updating customer:', error)
      return { success: false, error: 'Kunne ikke opdatere kunde' }
    }

    revalidatePath('/customers')
    revalidatePath(`/customers/${customerId}`)
    return { success: true, data: data as Customer }
  } catch (error) {
    console.error('Error in updateCustomer:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Delete customer
export async function deleteCustomer(id: string): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { error } = await supabase.from('customers').delete().eq('id', id)

    if (error) {
      console.error('Error deleting customer:', error)
      return { success: false, error: 'Kunne ikke slette kunde' }
    }

    revalidatePath('/customers')
    return { success: true }
  } catch (error) {
    console.error('Error in deleteCustomer:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Toggle customer active status
export async function toggleCustomerActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<Customer>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('customers')
      .update({ is_active: isActive })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error toggling customer status:', error)
      return { success: false, error: 'Kunne ikke opdatere status' }
    }

    revalidatePath('/customers')
    revalidatePath(`/customers/${id}`)
    return { success: true, data: data as Customer }
  } catch (error) {
    console.error('Error in toggleCustomerActive:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ==================== Customer Contacts ====================

// Get customer contacts
export async function getCustomerContacts(
  customerId: string
): Promise<ActionResult<CustomerContact[]>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('customer_contacts')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_primary', { ascending: false })
      .order('name')

    if (error) {
      console.error('Error fetching customer contacts:', error)
      return { success: false, error: 'Kunne ikke hente kontakter' }
    }

    return { success: true, data: data as CustomerContact[] }
  } catch (error) {
    console.error('Error in getCustomerContacts:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Create customer contact
export async function createCustomerContact(
  formData: FormData
): Promise<ActionResult<CustomerContact>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const rawData = {
      customer_id: formData.get('customer_id') as string,
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

    const supabase = await createClient()

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
      console.error('Error creating customer contact:', error)
      return { success: false, error: 'Kunne ikke oprette kontakt' }
    }

    revalidatePath(`/customers/${validated.data.customer_id}`)
    return { success: true, data: data as CustomerContact }
  } catch (error) {
    console.error('Error in createCustomerContact:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update customer contact
export async function updateCustomerContact(
  formData: FormData
): Promise<ActionResult<CustomerContact>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    const customerId = formData.get('customer_id') as string

    if (!id) {
      return { success: false, error: 'Kontakt ID mangler' }
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

    const supabase = await createClient()

    // If this contact is primary, unset any existing primary contact
    if (validated.data.is_primary) {
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
      console.error('Error updating customer contact:', error)
      return { success: false, error: 'Kunne ikke opdatere kontakt' }
    }

    revalidatePath(`/customers/${customerId}`)
    return { success: true, data: data as CustomerContact }
  } catch (error) {
    console.error('Error in updateCustomerContact:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Delete customer contact
export async function deleteCustomerContact(
  id: string,
  customerId: string
): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from('customer_contacts')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting customer contact:', error)
      return { success: false, error: 'Kunne ikke slette kontakt' }
    }

    revalidatePath(`/customers/${customerId}`)
    return { success: true }
  } catch (error) {
    console.error('Error in deleteCustomerContact:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}
