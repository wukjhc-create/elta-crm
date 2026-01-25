'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import {
  createOfferSchema,
  updateOfferSchema,
  createLineItemSchema,
  updateLineItemSchema,
} from '@/lib/validations/offers'
import type {
  Offer,
  OfferWithRelations,
  OfferLineItem,
  OfferStatus,
} from '@/types/offers.types'

export interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// Get all offers with optional filtering
export async function getOffers(filters?: {
  search?: string
  status?: OfferStatus
  customer_id?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}): Promise<ActionResult<OfferWithRelations[]>> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('offers')
      .select(`
        *,
        customer:customers(id, customer_number, company_name, contact_person, email),
        lead:leads(id, company_name, contact_person, email),
        created_by_profile:profiles!offers_created_by_fkey(id, full_name, email)
      `)

    // Apply filters
    if (filters?.search) {
      query = query.or(
        `title.ilike.%${filters.search}%,offer_number.ilike.%${filters.search}%`
      )
    }

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.customer_id) {
      query = query.eq('customer_id', filters.customer_id)
    }

    // Apply sorting
    const sortBy = filters?.sortBy || 'created_at'
    const sortOrder = filters?.sortOrder || 'desc'
    query = query.order(sortBy, { ascending: sortOrder === 'asc' })

    const { data, error } = await query

    if (error) {
      console.error('Error fetching offers:', error)
      return { success: false, error: 'Kunne ikke hente tilbud' }
    }

    return { success: true, data: data as OfferWithRelations[] }
  } catch (error) {
    console.error('Error in getOffers:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get single offer by ID with all relations
export async function getOffer(id: string): Promise<ActionResult<OfferWithRelations>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('offers')
      .select(`
        *,
        line_items:offer_line_items(*),
        customer:customers(id, customer_number, company_name, contact_person, email, phone, billing_address, billing_city, billing_postal_code, billing_country),
        lead:leads(id, company_name, contact_person, email),
        created_by_profile:profiles!offers_created_by_fkey(id, full_name, email)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching offer:', error)
      return { success: false, error: 'Kunne ikke hente tilbud' }
    }

    // Sort line items by position
    if (data.line_items) {
      data.line_items.sort((a: OfferLineItem, b: OfferLineItem) => a.position - b.position)
    }

    return { success: true, data: data as OfferWithRelations }
  } catch (error) {
    console.error('Error in getOffer:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Generate next offer number
async function generateOfferNumber(): Promise<string> {
  const supabase = await createClient()
  const currentYear = new Date().getFullYear()
  const prefix = `TILBUD-${currentYear}-`

  const { data } = await supabase
    .from('offers')
    .select('offer_number')
    .like('offer_number', `${prefix}%`)
    .order('offer_number', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) {
    return `${prefix}0001`
  }

  const lastNumber = data[0].offer_number
  const numPart = parseInt(lastNumber.split('-').pop() || '0', 10)
  const nextNum = numPart + 1
  return `${prefix}${nextNum.toString().padStart(4, '0')}`
}

// Create new offer
export async function createOffer(formData: FormData): Promise<ActionResult<Offer>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const rawData = {
      title: formData.get('title') as string,
      description: formData.get('description') as string || null,
      customer_id: formData.get('customer_id') as string || null,
      lead_id: formData.get('lead_id') as string || null,
      discount_percentage: formData.get('discount_percentage')
        ? Number(formData.get('discount_percentage'))
        : 0,
      tax_percentage: formData.get('tax_percentage')
        ? Number(formData.get('tax_percentage'))
        : 25,
      valid_until: formData.get('valid_until') as string || null,
      terms_and_conditions: formData.get('terms_and_conditions') as string || null,
      notes: formData.get('notes') as string || null,
    }

    const validated = createOfferSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const offerNumber = await generateOfferNumber()

    const { data, error } = await supabase
      .from('offers')
      .insert({
        ...validated.data,
        offer_number: offerNumber,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating offer:', error)
      return { success: false, error: 'Kunne ikke oprette tilbud' }
    }

    revalidatePath('/offers')
    return { success: true, data: data as Offer }
  } catch (error) {
    console.error('Error in createOffer:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update offer
export async function updateOffer(formData: FormData): Promise<ActionResult<Offer>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Tilbud ID mangler' }
    }

    const rawData = {
      id,
      title: formData.get('title') as string,
      description: formData.get('description') as string || null,
      customer_id: formData.get('customer_id') as string || null,
      lead_id: formData.get('lead_id') as string || null,
      discount_percentage: formData.get('discount_percentage')
        ? Number(formData.get('discount_percentage'))
        : 0,
      tax_percentage: formData.get('tax_percentage')
        ? Number(formData.get('tax_percentage'))
        : 25,
      valid_until: formData.get('valid_until') as string || null,
      terms_and_conditions: formData.get('terms_and_conditions') as string || null,
      notes: formData.get('notes') as string || null,
    }

    const validated = updateOfferSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    const { id: offerId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('offers')
      .update(updateData)
      .eq('id', offerId)
      .select()
      .single()

    if (error) {
      console.error('Error updating offer:', error)
      return { success: false, error: 'Kunne ikke opdatere tilbud' }
    }

    revalidatePath('/offers')
    revalidatePath(`/offers/${offerId}`)
    return { success: true, data: data as Offer }
  } catch (error) {
    console.error('Error in updateOffer:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Delete offer
export async function deleteOffer(id: string): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { error } = await supabase.from('offers').delete().eq('id', id)

    if (error) {
      console.error('Error deleting offer:', error)
      return { success: false, error: 'Kunne ikke slette tilbud' }
    }

    revalidatePath('/offers')
    return { success: true }
  } catch (error) {
    console.error('Error in deleteOffer:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update offer status
export async function updateOfferStatus(
  id: string,
  status: OfferStatus
): Promise<ActionResult<Offer>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const updateData: Record<string, unknown> = { status }

    // Set timestamp based on status
    const now = new Date().toISOString()
    switch (status) {
      case 'sent':
        updateData.sent_at = now
        break
      case 'viewed':
        updateData.viewed_at = now
        break
      case 'accepted':
        updateData.accepted_at = now
        break
      case 'rejected':
        updateData.rejected_at = now
        break
    }

    const { data, error } = await supabase
      .from('offers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating offer status:', error)
      return { success: false, error: 'Kunne ikke opdatere status' }
    }

    revalidatePath('/offers')
    revalidatePath(`/offers/${id}`)
    return { success: true, data: data as Offer }
  } catch (error) {
    console.error('Error in updateOfferStatus:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ==================== Line Items ====================

// Get line items for offer
export async function getOfferLineItems(
  offerId: string
): Promise<ActionResult<OfferLineItem[]>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('offer_line_items')
      .select('*')
      .eq('offer_id', offerId)
      .order('position')

    if (error) {
      console.error('Error fetching line items:', error)
      return { success: false, error: 'Kunne ikke hente linjer' }
    }

    return { success: true, data: data as OfferLineItem[] }
  } catch (error) {
    console.error('Error in getOfferLineItems:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Create line item
export async function createLineItem(
  formData: FormData
): Promise<ActionResult<OfferLineItem>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const rawData = {
      offer_id: formData.get('offer_id') as string,
      position: Number(formData.get('position')),
      description: formData.get('description') as string,
      quantity: Number(formData.get('quantity')),
      unit: formData.get('unit') as string || 'stk',
      unit_price: Number(formData.get('unit_price')),
      discount_percentage: formData.get('discount_percentage')
        ? Number(formData.get('discount_percentage'))
        : 0,
    }

    const validated = createLineItemSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    // Calculate total (will also be done by trigger, but good to have client-side)
    const total = validated.data.quantity * validated.data.unit_price *
      (1 - (validated.data.discount_percentage || 0) / 100)

    const { data, error } = await supabase
      .from('offer_line_items')
      .insert({ ...validated.data, total })
      .select()
      .single()

    if (error) {
      console.error('Error creating line item:', error)
      return { success: false, error: 'Kunne ikke oprette linje' }
    }

    revalidatePath(`/offers/${validated.data.offer_id}`)
    return { success: true, data: data as OfferLineItem }
  } catch (error) {
    console.error('Error in createLineItem:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update line item
export async function updateLineItem(
  formData: FormData
): Promise<ActionResult<OfferLineItem>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    const offerId = formData.get('offer_id') as string

    if (!id) {
      return { success: false, error: 'Linje ID mangler' }
    }

    const rawData = {
      id,
      position: Number(formData.get('position')),
      description: formData.get('description') as string,
      quantity: Number(formData.get('quantity')),
      unit: formData.get('unit') as string || 'stk',
      unit_price: Number(formData.get('unit_price')),
      discount_percentage: formData.get('discount_percentage')
        ? Number(formData.get('discount_percentage'))
        : 0,
    }

    const validated = updateLineItemSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    const { id: lineItemId, ...updateData } = validated.data

    // Calculate total
    const total = (updateData.quantity || 1) * (updateData.unit_price || 0) *
      (1 - (updateData.discount_percentage || 0) / 100)

    const { data, error } = await supabase
      .from('offer_line_items')
      .update({ ...updateData, total })
      .eq('id', lineItemId)
      .select()
      .single()

    if (error) {
      console.error('Error updating line item:', error)
      return { success: false, error: 'Kunne ikke opdatere linje' }
    }

    revalidatePath(`/offers/${offerId}`)
    return { success: true, data: data as OfferLineItem }
  } catch (error) {
    console.error('Error in updateLineItem:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Delete line item
export async function deleteLineItem(
  id: string,
  offerId: string
): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from('offer_line_items')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting line item:', error)
      return { success: false, error: 'Kunne ikke slette linje' }
    }

    revalidatePath(`/offers/${offerId}`)
    return { success: true }
  } catch (error) {
    console.error('Error in deleteLineItem:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ==================== Helpers ====================

// Get customers for dropdown
export async function getCustomersForSelect(): Promise<
  ActionResult<{ id: string; company_name: string; customer_number: string }[]>
> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('customers')
      .select('id, company_name, customer_number')
      .eq('is_active', true)
      .order('company_name')

    if (error) {
      console.error('Error fetching customers:', error)
      return { success: false, error: 'Kunne ikke hente kunder' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in getCustomersForSelect:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get leads for dropdown
export async function getLeadsForSelect(): Promise<
  ActionResult<{ id: string; company_name: string }[]>
> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('leads')
      .select('id, company_name')
      .not('status', 'in', '("won","lost")')
      .order('company_name')

    if (error) {
      console.error('Error fetching leads:', error)
      return { success: false, error: 'Kunne ikke hente leads' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in getLeadsForSelect:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}
