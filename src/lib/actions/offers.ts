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
import { validateUUID, sanitizeSearchTerm } from '@/lib/validations/common'
import { logOfferActivity } from '@/lib/actions/offer-activities'
import { logCreate, logUpdate, logDelete, logStatusChange, createAuditLog } from '@/lib/actions/audit'
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
import type { PaginatedResponse, ActionResult } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'

// =====================================================
// Helper Functions
// =====================================================

async function requireAuth(): Promise<string> {
  const user = await getUser()
  if (!user) {
    throw new Error('AUTH_REQUIRED')
  }
  return user.id
}

function formatError(err: unknown, defaultMessage: string): string {
  if (err instanceof Error) {
    if (err.message === 'AUTH_REQUIRED') {
      return 'Du skal være logget ind'
    }
    if (err.message.startsWith('Ugyldig')) {
      return err.message
    }
  }
  console.error(`${defaultMessage}:`, err)
  return defaultMessage
}

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
    await requireAuth()
    const supabase = await createClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Validate customer_id if provided
    if (filters?.customer_id) {
      validateUUID(filters.customer_id, 'kunde ID')
    }

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

    // Apply filters to both queries with sanitized search
    if (filters?.search) {
      const sanitized = sanitizeSearchTerm(filters.search)
      const searchFilter = `title.ilike.%${sanitized}%,offer_number.ilike.%${sanitized}%`
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
      console.error('Database error counting offers:', countResult.error)
      throw new Error('DATABASE_ERROR')
    }

    if (dataResult.error) {
      console.error('Database error fetching offers:', dataResult.error)
      throw new Error('DATABASE_ERROR')
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
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente tilbud') }
  }
}

// Get single offer by ID with all relations
export async function getOffer(id: string): Promise<ActionResult<OfferWithRelations>> {
  try {
    await requireAuth()
    validateUUID(id, 'tilbud ID')

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
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Tilbuddet blev ikke fundet' }
      }
      console.error('Database error fetching offer:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Sort line items by position
    if (data.line_items) {
      data.line_items.sort((a: OfferLineItem, b: OfferLineItem) => a.position - b.position)
    }

    return { success: true, data: data as OfferWithRelations }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente tilbud') }
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
    const userId = await requireAuth()

    const customerId = formData.get('customer_id') as string || null
    const leadId = formData.get('lead_id') as string || null

    if (customerId) {
      validateUUID(customerId, 'kunde ID')
    }
    if (leadId) {
      validateUUID(leadId, 'lead ID')
    }

    const rawData = {
      title: formData.get('title') as string,
      description: formData.get('description') as string || null,
      customer_id: customerId,
      lead_id: leadId,
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
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Den valgte kunde eller lead findes ikke' }
      }
      console.error('Database error creating offer:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    await logOfferActivity(
      data.id,
      'created',
      `Tilbud "${data.title}" oprettet`,
      userId
    )

    // Audit log
    await logCreate('offer', data.id, data.title, {
      offer_number: data.offer_number,
      customer_id: data.customer_id,
    })

    revalidatePath('/offers')
    return { success: true, data: data as Offer }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette tilbud') }
  }
}

// Update offer
export async function updateOffer(formData: FormData): Promise<ActionResult<Offer>> {
  try {
    const userId = await requireAuth()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Tilbud ID mangler' }
    }
    validateUUID(id, 'tilbud ID')

    const customerId = formData.get('customer_id') as string || null
    const leadId = formData.get('lead_id') as string || null

    if (customerId) {
      validateUUID(customerId, 'kunde ID')
    }
    if (leadId) {
      validateUUID(leadId, 'lead ID')
    }

    const rawData = {
      id,
      title: formData.get('title') as string,
      description: formData.get('description') as string || null,
      customer_id: customerId,
      lead_id: leadId,
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
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Tilbuddet blev ikke fundet' }
      }
      if (error.code === '23503') {
        return { success: false, error: 'Den valgte kunde eller lead findes ikke' }
      }
      console.error('Database error updating offer:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    await logOfferActivity(
      offerId,
      'updated',
      'Tilbud opdateret',
      userId
    )

    // Audit log
    await logUpdate('offer', offerId, data.title, { updated: { old: false, new: true } })

    revalidatePath('/offers')
    revalidatePath(`/offers/${offerId}`)
    return { success: true, data: data as Offer }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere tilbud') }
  }
}

// Delete offer
export async function deleteOffer(id: string): Promise<ActionResult> {
  try {
    await requireAuth()
    validateUUID(id, 'tilbud ID')

    const supabase = await createClient()

    // Get offer before deleting for audit log
    const { data: offer } = await supabase
      .from('offers')
      .select('title, offer_number')
      .eq('id', id)
      .single()

    const { error } = await supabase.from('offers').delete().eq('id', id)

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Tilbuddet kan ikke slettes da det har tilknyttede data' }
      }
      console.error('Database error deleting offer:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Audit log
    await logDelete('offer', id, offer?.title || 'Ukendt', {
      offer_number: offer?.offer_number,
    })

    revalidatePath('/offers')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette tilbud') }
  }
}

// Update offer status
export async function updateOfferStatus(
  id: string,
  status: OfferStatus
): Promise<ActionResult<Offer>> {
  try {
    const userId = await requireAuth()
    validateUUID(id, 'tilbud ID')

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
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Tilbuddet blev ikke fundet' }
      }
      console.error('Database error updating offer status:', error)
      throw new Error('DATABASE_ERROR')
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
      userId,
      { newStatus: status }
    )

    // Audit log - especially important for accepted/rejected
    const auditAction = status === 'accepted' ? 'accept' : status === 'rejected' ? 'reject' : 'status_change'
    await createAuditLog({
      entity_type: 'offer',
      entity_id: id,
      entity_name: data.title,
      action: auditAction,
      action_description: `Tilbud ${statusLabels[status].toLowerCase()}`,
      changes: { status: { old: 'previous', new: status } },
      metadata: {
        offer_number: data.offer_number,
        final_amount: data.final_amount,
      },
    })

    revalidatePath('/offers')
    revalidatePath(`/offers/${id}`)
    return { success: true, data: data as Offer }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere status') }
  }
}

// Send offer via email
export async function sendOffer(offerId: string): Promise<ActionResult<Offer>> {
  try {
    const userId = await requireAuth()
    validateUUID(offerId, 'tilbud ID')

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
          created_by: userId,
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
      userId,
      { recipientEmail: offer.customer.email, messageId: emailResult.messageId }
    )

    await logOfferActivity(
      offerId,
      'sent',
      'Tilbud sendt til kunde',
      userId,
      { portalUrl }
    )

    revalidatePath('/offers')
    revalidatePath(`/offers/${offerId}`)

    return { success: true, data: (updatedOffer || offer) as Offer }
  } catch (err) {
    return { success: false, error: formatError(err, 'Der opstod en fejl ved afsendelse') }
  }
}

// ==================== Line Items ====================

// Get line items for offer
export async function getOfferLineItems(
  offerId: string
): Promise<ActionResult<OfferLineItem[]>> {
  try {
    await requireAuth()
    validateUUID(offerId, 'tilbud ID')

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('offer_line_items')
      .select('*')
      .eq('offer_id', offerId)
      .order('position')

    if (error) {
      console.error('Database error fetching line items:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as OfferLineItem[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente linjer') }
  }
}

// Create line item
export async function createLineItem(
  formData: FormData
): Promise<ActionResult<OfferLineItem>> {
  try {
    await requireAuth()

    const offerId = formData.get('offer_id') as string
    if (!offerId) {
      return { success: false, error: 'Tilbud ID er påkrævet' }
    }
    validateUUID(offerId, 'tilbud ID')

    const rawData = {
      offer_id: offerId,
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
      if (error.code === '23503') {
        return { success: false, error: 'Tilbuddet findes ikke' }
      }
      console.error('Database error creating line item:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/offers/${validated.data.offer_id}`)
    return { success: true, data: data as OfferLineItem }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette linje') }
  }
}

// Update line item
export async function updateLineItem(
  formData: FormData
): Promise<ActionResult<OfferLineItem>> {
  try {
    await requireAuth()

    const id = formData.get('id') as string
    const offerId = formData.get('offer_id') as string

    if (!id) {
      return { success: false, error: 'Linje ID mangler' }
    }
    validateUUID(id, 'linje ID')

    if (offerId) {
      validateUUID(offerId, 'tilbud ID')
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
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Linjen blev ikke fundet' }
      }
      console.error('Database error updating line item:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/offers/${offerId}`)
    return { success: true, data: data as OfferLineItem }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere linje') }
  }
}

// Delete line item
export async function deleteLineItem(
  id: string,
  offerId: string
): Promise<ActionResult> {
  try {
    await requireAuth()
    validateUUID(id, 'linje ID')
    validateUUID(offerId, 'tilbud ID')

    const supabase = await createClient()

    const { error } = await supabase
      .from('offer_line_items')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Database error deleting line item:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/offers/${offerId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette linje') }
  }
}

// ==================== Helpers ====================

// Get customers for dropdown
export async function getCustomersForSelect(): Promise<
  ActionResult<{ id: string; company_name: string; customer_number: string }[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('customers')
      .select('id, company_name, customer_number')
      .eq('is_active', true)
      .order('company_name')

    if (error) {
      console.error('Database error fetching customers:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kunder') }
  }
}

// Get leads for dropdown
export async function getLeadsForSelect(): Promise<
  ActionResult<{ id: string; company_name: string }[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('leads')
      .select('id, company_name')
      .not('status', 'in', '("won","lost")')
      .order('company_name')

    if (error) {
      console.error('Database error fetching leads:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leads') }
  }
}

// ==================== Product & Calculation Integration ====================

// Add product to offer
export async function addProductToOffer(
  offerId: string,
  productId: string,
  quantity: number = 1,
  position?: number
): Promise<ActionResult<OfferLineItem>> {
  try {
    const userId = await requireAuth()
    validateUUID(offerId, 'tilbud ID')
    validateUUID(productId, 'produkt ID')

    const supabase = await createClient()

    // Get product details
    const { data: product, error: productError } = await supabase
      .from('product_catalog')
      .select('*')
      .eq('id', productId)
      .single()

    if (productError) {
      if (productError.code === 'PGRST116') {
        return { success: false, error: 'Produktet blev ikke fundet' }
      }
      console.error('Database error fetching product:', productError)
      throw new Error('DATABASE_ERROR')
    }

    // Get current max position if not specified
    let nextPosition = position
    if (nextPosition === undefined) {
      const { data: items } = await supabase
        .from('offer_line_items')
        .select('position')
        .eq('offer_id', offerId)
        .order('position', { ascending: false })
        .limit(1)

      nextPosition = items && items.length > 0 ? items[0].position + 1 : 0
    }

    // Calculate total
    const total = quantity * product.list_price

    // Create line item
    const { data, error } = await supabase
      .from('offer_line_items')
      .insert({
        offer_id: offerId,
        line_type: 'product',
        product_id: productId,
        position: nextPosition,
        description: product.name,
        quantity,
        unit: product.unit || 'stk',
        unit_price: product.list_price,
        cost_price: product.cost_price,
        discount_percentage: 0,
        total,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Tilbuddet findes ikke' }
      }
      console.error('Database error adding product to offer:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    await logOfferActivity(
      offerId,
      'updated',
      `Produkt "${product.name}" tilføjet`,
      userId
    )

    revalidatePath(`/offers/${offerId}`)
    return { success: true, data: data as OfferLineItem }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke tilføje produkt til tilbud') }
  }
}

// Import all rows from a calculation to an offer
export async function importCalculationToOffer(
  offerId: string,
  calculationId: string,
  options?: {
    startingPosition?: number
    groupBySection?: boolean
    includeHiddenRows?: boolean
    includeCostPrices?: boolean
  }
): Promise<ActionResult<{ importedCount: number }>> {
  try {
    const userId = await requireAuth()
    validateUUID(offerId, 'tilbud ID')
    validateUUID(calculationId, 'kalkulation ID')

    const supabase = await createClient()

    // Get calculation with rows
    const { data: calculation, error: calcError } = await supabase
      .from('calculations')
      .select('*, rows:calculation_rows(*)')
      .eq('id', calculationId)
      .single()

    if (calcError) {
      if (calcError.code === 'PGRST116') {
        return { success: false, error: 'Kalkulationen blev ikke fundet' }
      }
      console.error('Database error fetching calculation:', calcError)
      throw new Error('DATABASE_ERROR')
    }

    // Extract options with defaults
    const startingPosition = options?.startingPosition
    const groupBySection = options?.groupBySection ?? calculation.group_by_section ?? false
    const includeHiddenRows = options?.includeHiddenRows ?? false
    const includeCostPrices = options?.includeCostPrices ?? false

    // Filter rows that should be shown on offer (unless includeHiddenRows is true)
    let rowsToImport = calculation.rows || []
    if (!includeHiddenRows) {
      rowsToImport = rowsToImport.filter(
        (row: { show_on_offer: boolean }) => row.show_on_offer
      )
    }

    if (rowsToImport.length === 0) {
      return { success: false, error: 'Ingen linjer at importere' }
    }

    // Sort rows by section if grouping is enabled
    if (groupBySection) {
      rowsToImport = [...rowsToImport].sort((a: { section: string | null }, b: { section: string | null }) => {
        if (!a.section && !b.section) return 0
        if (!a.section) return 1
        if (!b.section) return -1
        return a.section.localeCompare(b.section)
      })
    }

    // Get current max position if not specified
    let nextPosition = startingPosition
    if (nextPosition === undefined) {
      const { data: items } = await supabase
        .from('offer_line_items')
        .select('position')
        .eq('offer_id', offerId)
        .order('position', { ascending: false })
        .limit(1)

      nextPosition = items && items.length > 0 ? items[0].position + 1 : 0
    }

    // Create line items from calculation rows
    // If grouping by section, add section headers
    const lineItems: Array<{
      offer_id: string
      line_type: string
      product_id: string | null
      calculation_id: string
      section: string | null
      position: number
      description: string
      quantity: number
      unit: string
      unit_price: number
      cost_price: number | null
      discount_percentage: number
      total: number
    }> = []

    let currentSection: string | null = null
    let positionCounter = nextPosition!

    for (const row of rowsToImport) {
      // Add section header if section changed and grouping is enabled
      if (groupBySection && row.section && row.section !== currentSection) {
        currentSection = row.section
        // Note: Section headers could be added here if the offer_line_items table supports them
        // For now, we just track the section in each row
      }

      lineItems.push({
        offer_id: offerId,
        line_type: row.product_id ? 'product' : 'calculation',
        product_id: row.product_id,
        calculation_id: calculationId,
        section: row.section,
        position: positionCounter++,
        description: row.description,
        quantity: row.hours || row.quantity, // Use hours if labor row
        unit: row.hours ? 'timer' : row.unit,
        unit_price: row.hourly_rate || row.sale_price, // Use hourly_rate if labor row
        cost_price: includeCostPrices ? row.cost_price : null,
        discount_percentage: row.discount_percentage,
        total: row.total,
      })
    }

    const { error: insertError } = await supabase
      .from('offer_line_items')
      .insert(lineItems)

    if (insertError) {
      if (insertError.code === '23503') {
        return { success: false, error: 'Tilbuddet findes ikke' }
      }
      console.error('Database error importing calculation to offer:', insertError)
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    await logOfferActivity(
      offerId,
      'updated',
      `Kalkulation "${calculation.name}" importeret (${lineItems.length} linjer)`,
      userId
    )

    revalidatePath(`/offers/${offerId}`)
    return { success: true, data: { importedCount: lineItems.length } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke importere kalkulation') }
  }
}
