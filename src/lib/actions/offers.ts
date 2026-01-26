'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient, getUser } from '@/lib/supabase/server'
import {
  createOfferSchema,
  updateOfferSchema,
  createLineItemSchema,
  updateLineItemSchema,
} from '@/lib/validations/offers'
import { logOfferActivity } from '@/lib/actions/offer-activities'
import { getCompanySettings, getSmtpSettings } from '@/lib/actions/settings'
import { sendEmail } from '@/lib/email/email-service'
import {
  generateOfferEmailHtml,
  generateOfferEmailText,
} from '@/lib/email/templates/offer-email'
import type {
  Offer,
  OfferWithRelations,
  OfferLineItem,
  OfferStatus,
} from '@/types/offers.types'
import type { PaginatedResponse } from '@/types/common.types'

export interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

const DEFAULT_PAGE_SIZE = 25

// Get all offers with optional filtering and pagination
export async function getOffers(filters?: {
  search?: string
  status?: OfferStatus
  customer_id?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}): Promise<ActionResult<PaginatedResponse<OfferWithRelations>>> {
  try {
    const supabase = await createClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Build count query
    let countQuery = supabase
      .from('offers')
      .select('*', { count: 'exact', head: true })

    // Build data query
    let dataQuery = supabase
      .from('offers')
      .select(`
        *,
        customer:customers(id, customer_number, company_name, contact_person, email),
        lead:leads(id, company_name, contact_person, email)
      `)

    // Apply filters to both queries
    if (filters?.search) {
      const searchFilter = `title.ilike.%${filters.search}%,offer_number.ilike.%${filters.search}%`
      countQuery = countQuery.or(searchFilter)
      dataQuery = dataQuery.or(searchFilter)
    }

    if (filters?.status) {
      countQuery = countQuery.eq('status', filters.status)
      dataQuery = dataQuery.eq('status', filters.status)
    }

    if (filters?.customer_id) {
      countQuery = countQuery.eq('customer_id', filters.customer_id)
      dataQuery = dataQuery.eq('customer_id', filters.customer_id)
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
      console.error('Error counting offers:', countResult.error)
      return { success: false, error: 'Kunne ikke hente tilbud' }
    }

    if (dataResult.error) {
      console.error('Error fetching offers:', dataResult.error)
      return { success: false, error: 'Kunne ikke hente tilbud' }
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: dataResult.data as OfferWithRelations[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
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
        lead:leads(id, company_name, contact_person, email)
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

    // Log activity
    await logOfferActivity(
      data.id,
      'created',
      `Tilbud "${data.title}" oprettet`,
      user.id
    )

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

    // Log activity
    await logOfferActivity(
      offerId,
      'updated',
      'Tilbud opdateret',
      user.id
    )

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

    // Log activity
    const statusLabels: Record<OfferStatus, string> = {
      draft: 'Kladde',
      sent: 'Sendt',
      viewed: 'Set',
      accepted: 'Accepteret',
      rejected: 'Afvist',
      expired: 'Udløbet',
    }
    await logOfferActivity(
      id,
      'status_change',
      `Status ændret til "${statusLabels[status]}"`,
      user.id,
      { newStatus: status }
    )

    revalidatePath('/offers')
    revalidatePath(`/offers/${id}`)
    return { success: true, data: data as Offer }
  } catch (error) {
    console.error('Error in updateOfferStatus:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Send offer via email
export async function sendOffer(offerId: string): Promise<ActionResult<Offer>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    // Get offer with customer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select(`
        *,
        line_items:offer_line_items(*),
        customer:customers(id, customer_number, company_name, contact_person, email, phone, billing_address, billing_city, billing_postal_code, billing_country)
      `)
      .eq('id', offerId)
      .single()

    if (offerError || !offer) {
      console.error('Error fetching offer for send:', offerError)
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    // Validate offer has customer with email
    if (!offer.customer) {
      return { success: false, error: 'Tilbuddet har ingen tilknyttet kunde' }
    }

    if (!offer.customer.email) {
      return { success: false, error: 'Kunden har ingen email-adresse' }
    }

    // Get company settings
    const settingsResult = await getCompanySettings()
    if (!settingsResult.success || !settingsResult.data) {
      return { success: false, error: 'Kunne ikke hente virksomhedsindstillinger' }
    }

    // Get or create portal token
    let portalToken: string

    // Check if customer already has an active portal token
    const { data: existingTokens } = await supabase
      .from('portal_access_tokens')
      .select('token')
      .eq('customer_id', offer.customer.id)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingTokens && existingTokens.length > 0) {
      portalToken = existingTokens[0].token
    } else {
      // Create new portal token
      const tokenBytes = new Uint8Array(32)
      crypto.getRandomValues(tokenBytes)
      const newToken = Array.from(tokenBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      // Expires in 30 days
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)

      const { data: tokenData, error: tokenError } = await supabase
        .from('portal_access_tokens')
        .insert({
          customer_id: offer.customer.id,
          email: offer.customer.email,
          token: newToken,
          expires_at: expiresAt.toISOString(),
          created_by: user.id,
        })
        .select('token')
        .single()

      if (tokenError || !tokenData) {
        console.error('Error creating portal token:', tokenError)
        return { success: false, error: 'Kunne ikke oprette portal-adgang' }
      }

      portalToken = tokenData.token
    }

    // Build portal URL
    const headersList = await headers()
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const portalUrl = `${protocol}://${host}/portal/${portalToken}/offers/${offerId}`

    // Sort line items
    if (offer.line_items) {
      offer.line_items.sort((a: { position: number }, b: { position: number }) =>
        a.position - b.position
      )
    }

    // Get SMTP settings
    const smtpResult = await getSmtpSettings()

    // Generate email content
    const emailHtml = generateOfferEmailHtml({
      offer: offer as OfferWithRelations,
      companySettings: settingsResult.data,
      portalUrl,
    })

    const emailText = generateOfferEmailText({
      offer: offer as OfferWithRelations,
      companySettings: settingsResult.data,
      portalUrl,
    })

    // Send email
    const emailResult = await sendEmail(
      {
        to: offer.customer.email,
        subject: `Tilbud ${offer.offer_number}: ${offer.title}`,
        html: emailHtml,
        text: emailText,
      },
      smtpResult.success && smtpResult.data
        ? {
            host: smtpResult.data.host || undefined,
            port: smtpResult.data.port || undefined,
            user: smtpResult.data.user || undefined,
            password: smtpResult.data.password || undefined,
            fromEmail: smtpResult.data.fromEmail || undefined,
            fromName: smtpResult.data.fromName || undefined,
          }
        : undefined
    )

    if (!emailResult.success) {
      console.error('Error sending offer email:', emailResult.error)
      return { success: false, error: `Kunne ikke sende email: ${emailResult.error}` }
    }

    // Update offer status to 'sent'
    const now = new Date().toISOString()
    const { data: updatedOffer, error: updateError } = await supabase
      .from('offers')
      .update({
        status: 'sent',
        sent_at: now,
      })
      .eq('id', offerId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating offer status after send:', updateError)
      // Email was sent, but status update failed - still log activities
    }

    // Log activities
    await logOfferActivity(
      offerId,
      'email_sent',
      `Email sendt til ${offer.customer.email}`,
      user.id,
      { recipientEmail: offer.customer.email, messageId: emailResult.messageId }
    )

    await logOfferActivity(
      offerId,
      'sent',
      'Tilbud sendt til kunde',
      user.id,
      { portalUrl }
    )

    revalidatePath('/offers')
    revalidatePath(`/offers/${offerId}`)

    return { success: true, data: (updatedOffer || offer) as Offer }
  } catch (error) {
    console.error('Error in sendOffer:', error)
    return { success: false, error: 'Der opstod en fejl ved afsendelse' }
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
