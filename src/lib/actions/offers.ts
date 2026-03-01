'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import {
  createOfferSchema,
  updateOfferSchema,
  createLineItemSchema,
  updateLineItemSchema,
} from '@/lib/validations/offers'
import { validateUUID, sanitizeSearchTerm } from '@/lib/validations/common'
import { logOfferActivity } from '@/lib/actions/offer-activities'
import { PORTAL_TOKEN_EXPIRY_DAYS, CALC_DEFAULTS } from '@/lib/constants'
import { getCalculationSettings } from '@/lib/actions/calculation-settings'
import { logCreate, logUpdate, logDelete, logStatusChange, createAuditLog } from '@/lib/actions/audit'
import { triggerWebhooks, buildOfferWebhookPayload } from '@/lib/actions/integrations'
import { getCompanySettings, getSmtpSettings } from '@/lib/actions/settings'
import { sendEmail } from '@/lib/email/email-service'
import {
  generateOfferEmailHtml,
  generateOfferEmailText,
} from '@/lib/email/templates/offer-email'
import { isValidOfferTransition, OFFER_STATUS_LABELS } from '@/types/offers.types'
import type {
  Offer,
  OfferWithRelations,
  OfferLineItem,
  OfferStatus,
} from '@/types/offers.types'
import type { PaginatedResponse, ActionResult } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'
import { formatError, getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'

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
    const { supabase } = await getAuthenticatedClient()
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
      logger.error('Database error counting offers', { error: countResult.error })
      throw new Error('DATABASE_ERROR')
    }

    if (dataResult.error) {
      logger.error('Database error fetching offers', { error: dataResult.error })
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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'tilbud ID')

    const { data, error } = await supabase
      .from('offers')
      .select(`
        *,
        line_items:offer_line_items(*),
        customer:customers(id, customer_number, company_name, contact_person, email, phone, billing_address, billing_city, billing_postal_code, billing_country),
        lead:leads(id, company_name, contact_person, email)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      logger.error('Database error fetching offer', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    if (!data) {
      return { success: false, error: 'Tilbuddet blev ikke fundet' }
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
  const { supabase } = await getAuthenticatedClient()
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
    const { supabase, userId } = await getAuthenticatedClient()

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
      logger.error('Database error creating offer', { error: error })
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
    const { supabase, userId } = await getAuthenticatedClient()

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
      logger.error('Database error updating offer', { error: error })
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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'tilbud ID')

    // Get offer before deleting for audit log
    const { data: offer } = await supabase
      .from('offers')
      .select('title, offer_number')
      .eq('id', id)
      .maybeSingle()

    const { error } = await supabase.from('offers').delete().eq('id', id)

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Tilbuddet kan ikke slettes da det har tilknyttede data' }
      }
      logger.error('Database error deleting offer', { error: error })
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
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(id, 'tilbud ID')

    // Fetch current status for transition validation
    const { data: current, error: fetchError } = await supabase
      .from('offers')
      .select('status')
      .eq('id', id)
      .maybeSingle()

    if (fetchError || !current) {
      return { success: false, error: 'Tilbuddet blev ikke fundet' }
    }

    if (!isValidOfferTransition(current.status as OfferStatus, status)) {
      return {
        success: false,
        error: `Kan ikke ændre status fra "${OFFER_STATUS_LABELS[current.status as OfferStatus]}" til "${OFFER_STATUS_LABELS[status]}"`,
      }
    }

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
      logger.error('Database error updating offer status', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    await logOfferActivity(
      id,
      'status_change',
      `Status ændret til "${OFFER_STATUS_LABELS[status]}"`,
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
      action_description: `Tilbud ${OFFER_STATUS_LABELS[status].toLowerCase()}`,
      changes: { status: { old: 'previous', new: status } },
      metadata: {
        offer_number: data.offer_number,
        final_amount: data.final_amount,
      },
    })

    // Trigger webhooks for status changes
    const webhookEventMap: Partial<Record<OfferStatus, 'offer.sent' | 'offer.viewed' | 'offer.accepted' | 'offer.rejected' | 'offer.expired'>> = {
      sent: 'offer.sent',
      viewed: 'offer.viewed',
      accepted: 'offer.accepted',
      rejected: 'offer.rejected',
      expired: 'offer.expired',
    }
    const webhookEvent = webhookEventMap[status]
    if (webhookEvent) {
      const payload = await buildOfferWebhookPayload(id, webhookEvent)
      if (payload) {
        // Fire and forget - don't block the response
        triggerWebhooks(webhookEvent, payload).catch(err => {
          logger.error('Error triggering webhooks', { error: err })
        })
      }
    }

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
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(offerId, 'tilbud ID')

    // Get offer with customer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select(`
        *,
        line_items:offer_line_items(*),
        customer:customers(id, customer_number, company_name, contact_person, email, phone, billing_address, billing_city, billing_postal_code, billing_country)
      `)
      .eq('id', offerId)
      .maybeSingle()

    if (offerError || !offer) {
      logger.error('Error fetching offer for send', { error: offerError })
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

      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + PORTAL_TOKEN_EXPIRY_DAYS)

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
        logger.error('Error creating portal token', { error: tokenError })
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
      logger.error('Error sending offer email', { error: emailResult.error })
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
      logger.error('Error updating offer status after send', { error: updateError })
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

    // Trigger webhooks for offer.sent
    const payload = await buildOfferWebhookPayload(offerId, 'offer.sent')
    if (payload) {
      triggerWebhooks('offer.sent', payload).catch(err => {
        logger.error('Error triggering webhooks', { error: err })
      })
    }

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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(offerId, 'tilbud ID')

    const { data, error } = await supabase
      .from('offer_line_items')
      .select('*')
      .eq('offer_id', offerId)
      .order('position')

    if (error) {
      logger.error('Database error fetching line items', { error: error })
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
    const { supabase } = await getAuthenticatedClient()

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
      logger.error('Database error creating line item', { error: error })
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
    const { supabase } = await getAuthenticatedClient()

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
      logger.error('Database error updating line item', { error: error })
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
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'linje ID')
    validateUUID(offerId, 'tilbud ID')

    const { error } = await supabase
      .from('offer_line_items')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting line item', { error: error })
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
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('customers')
      .select('id, company_name, customer_number')
      .eq('is_active', true)
      .order('company_name')

    if (error) {
      logger.error('Database error fetching customers', { error: error })
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
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('leads')
      .select('id, company_name')
      .not('status', 'in', '("won","lost")')
      .order('company_name')

    if (error) {
      logger.error('Database error fetching leads', { error: error })
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
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(offerId, 'tilbud ID')
    validateUUID(productId, 'produkt ID')

    // Get product details
    const { data: product, error: productError } = await supabase
      .from('product_catalog')
      .select('*')
      .eq('id', productId)
      .maybeSingle()

    if (productError) {
      logger.error('Database error fetching product', { error: productError })
      throw new Error('DATABASE_ERROR')
    }

    if (!product) {
      return { success: false, error: 'Produktet blev ikke fundet' }
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
      logger.error('Database error adding product to offer', { error: error })
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
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(offerId, 'tilbud ID')
    validateUUID(calculationId, 'kalkulation ID')

    // Get calculation with rows
    const { data: calculation, error: calcError } = await supabase
      .from('calculations')
      .select('*, rows:calculation_rows(*)')
      .eq('id', calculationId)
      .maybeSingle()

    if (calcError) {
      logger.error('Database error fetching calculation', { error: calcError })
      throw new Error('DATABASE_ERROR')
    }

    if (!calculation) {
      return { success: false, error: 'Kalkulationen blev ikke fundet' }
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
    let positionCounter = nextPosition ?? 0

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
      logger.error('Database error importing calculation to offer', { error: insertError })
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

// =====================================================
// Supplier Product Integration
// =====================================================

/**
 * Create a line item from a supplier product.
 * Automatically applies margin rules and tracks supplier information.
 */
export async function createLineItemFromSupplierProduct(
  offerId: string,
  supplierProductId: string,
  quantity: number,
  options?: {
    customMarginPercentage?: number
    customDiscount?: number
    customDescription?: string
    position?: number
  }
): Promise<ActionResult<OfferLineItem>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(offerId, 'tilbud ID')
    validateUUID(supplierProductId, 'leverandør produkt ID')

    // Get offer to check customer for custom pricing
    const { data: offer } = await supabase
      .from('offers')
      .select('customer_id')
      .eq('id', offerId)
      .maybeSingle()

    // Get supplier product with supplier info
    const { data: supplierProduct, error: spError } = await supabase
      .from('supplier_products')
      .select(`
        id,
        supplier_id,
        supplier_sku,
        supplier_name,
        cost_price,
        list_price,
        margin_percentage,
        unit,
        image_url,
        suppliers!inner (
          name,
          code
        )
      `)
      .eq('id', supplierProductId)
      .maybeSingle()

    if (spError || !supplierProduct) {
      return { success: false, error: 'Leverandør produkt ikke fundet' }
    }

    if (!supplierProduct.cost_price) {
      return { success: false, error: 'Produktet har ingen kostpris' }
    }

    // Get effective margin from rules engine (DB function with full hierarchy)
    let marginPercentage = options?.customMarginPercentage ?? supplierProduct.margin_percentage ?? CALC_DEFAULTS.MARGINS.MATERIALS
    let effectiveCostPrice = supplierProduct.cost_price
    let fixedMarkup = 0
    let roundTo: number | null = null

    // Try margin rules engine first, then fall back to customer pricing
    const { data: marginData } = await supabase.rpc('get_effective_margin', {
      p_supplier_id: supplierProduct.supplier_id,
      p_supplier_product_id: supplierProductId,
      p_category: null,
      p_sub_category: null,
      p_customer_id: offer?.customer_id || null,
    })

    if (marginData && marginData.length > 0 && !options?.customMarginPercentage) {
      marginPercentage = marginData[0].margin_percentage
      fixedMarkup = marginData[0].fixed_markup || 0
      roundTo = marginData[0].round_to
    } else if (offer?.customer_id && !options?.customMarginPercentage) {
      // Fallback: check customer-specific pricing
      const { data: customerPricing } = await supabase
        .from('customer_supplier_prices')
        .select('discount_percentage, custom_margin_percentage')
        .eq('customer_id', offer.customer_id)
        .eq('supplier_id', supplierProduct.supplier_id)
        .eq('is_active', true)
        .maybeSingle()

      if (customerPricing) {
        if (customerPricing.discount_percentage) {
          effectiveCostPrice = supplierProduct.cost_price * (1 - customerPricing.discount_percentage / 100)
        }
        if (customerPricing.custom_margin_percentage !== null) {
          marginPercentage = customerPricing.custom_margin_percentage
        }
      }
    }

    // Calculate sale price with margin + optional fixed markup and rounding
    let unitPrice = effectiveCostPrice * (1 + marginPercentage / 100) + fixedMarkup
    if (roundTo && roundTo > 0) {
      unitPrice = Math.ceil(unitPrice / roundTo) * roundTo
    }

    // Get next position if not provided
    let position = options?.position
    if (position === undefined) {
      const { data: maxPos } = await supabase
        .from('offer_line_items')
        .select('position')
        .eq('offer_id', offerId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()

      position = (maxPos?.position || 0) + 1
    }

    // Calculate total
    const discount = options?.customDiscount ?? 0
    const total = quantity * unitPrice * (1 - discount / 100)

    // Get supplier name
    const supplierInfo = Array.isArray(supplierProduct.suppliers)
      ? supplierProduct.suppliers[0]
      : supplierProduct.suppliers

    // Insert line item with supplier tracking
    const { data, error } = await supabase
      .from('offer_line_items')
      .insert({
        offer_id: offerId,
        position,
        description: options?.customDescription || supplierProduct.supplier_name,
        quantity,
        unit: supplierProduct.unit || 'stk',
        unit_price: Math.round(unitPrice * 100) / 100,
        discount_percentage: discount,
        total,
        supplier_product_id: supplierProductId,
        supplier_cost_price_at_creation: supplierProduct.cost_price,
        supplier_margin_applied: marginPercentage,
        supplier_name_at_creation: supplierInfo?.name || null,
        image_url: supplierProduct.image_url || null,
      })
      .select()
      .single()

    if (error) {
      logger.error('Database error creating line item from supplier product', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    await logOfferActivity(
      offerId,
      'updated',
      `Tilføjet fra leverandør: ${supplierProduct.supplier_name} (${supplierProduct.supplier_sku})`,
      userId
    )

    revalidatePath(`/offers/${offerId}`)
    return { success: true, data: data as OfferLineItem }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette linje fra leverandør produkt') }
  }
}

/**
 * Search supplier products and add to offer.
 * Returns matching products that can be added as line items.
 */
export async function searchSupplierProductsForOffer(
  query: string,
  options?: {
    supplierId?: string
    customerId?: string
    limit?: number
  }
): Promise<ActionResult<Array<{
  id: string
  supplier_id: string
  supplier_name: string
  supplier_code: string
  supplier_sku: string
  product_name: string
  cost_price: number
  list_price: number | null
  margin_percentage: number
  estimated_sale_price: number
  unit: string
  is_available: boolean
  image_url: string | null
}>>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Hent global produkt-avance fra indstillinger (auto-markup)
    const calcResult = await getCalculationSettings()
    const defaultProductMargin = calcResult.success && calcResult.data
      ? calcResult.data.margins.products
      : CALC_DEFAULTS.MARGINS.PRODUCTS

    let dbQuery = supabase
      .from('supplier_products')
      .select(`
        id,
        supplier_id,
        supplier_sku,
        supplier_name,
        cost_price,
        list_price,
        margin_percentage,
        unit,
        is_available,
        image_url,
        suppliers!inner (
          name,
          code,
          is_active
        )
      `)
      .eq('suppliers.is_active', true)
      .or(`supplier_sku.ilike.%${sanitizeSearchTerm(query)}%,supplier_name.ilike.%${sanitizeSearchTerm(query)}%`)
      .limit(options?.limit || 20)

    if (options?.supplierId) {
      validateUUID(options.supplierId, 'leverandør ID')
      dbQuery = dbQuery.eq('supplier_id', options.supplierId)
    }

    const { data, error } = await dbQuery

    if (error) {
      logger.error('Database error searching supplier products', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Get customer-specific pricing if customer provided
    let customerPricingMap = new Map<string, { discount: number; margin: number | null }>()
    if (options?.customerId) {
      validateUUID(options.customerId, 'kunde ID')

      const { data: customerPricing } = await supabase
        .from('customer_supplier_prices')
        .select('supplier_id, discount_percentage, custom_margin_percentage')
        .eq('customer_id', options.customerId)
        .eq('is_active', true)

      if (customerPricing) {
        customerPricingMap = new Map(
          customerPricing.map((cp) => [
            cp.supplier_id,
            { discount: cp.discount_percentage || 0, margin: cp.custom_margin_percentage }
          ])
        )
      }
    }

    // Transform results
    const results = (data || []).map((sp) => {
      const supplier = Array.isArray(sp.suppliers) ? sp.suppliers[0] : sp.suppliers
      const customerPricing = customerPricingMap.get(sp.supplier_id)

      let effectiveCost = sp.cost_price || 0
      let margin = sp.margin_percentage || defaultProductMargin

      if (customerPricing) {
        effectiveCost = (sp.cost_price || 0) * (1 - customerPricing.discount / 100)
        if (customerPricing.margin !== null) {
          margin = customerPricing.margin
        }
      }

      return {
        id: sp.id,
        supplier_id: sp.supplier_id,
        supplier_name: supplier?.name || '',
        supplier_code: supplier?.code || '',
        supplier_sku: sp.supplier_sku,
        product_name: sp.supplier_name,
        cost_price: sp.cost_price || 0,
        list_price: sp.list_price,
        margin_percentage: margin,
        estimated_sale_price: Math.round(effectiveCost * (1 + margin / 100) * 100) / 100,
        unit: sp.unit || 'stk',
        is_available: sp.is_available,
        image_url: sp.image_url || null,
      }
    })

    return { success: true, data: results }
  } catch (err) {
    return { success: false, error: formatError(err, 'Søgning fejlede') }
  }
}

/**
 * Live API search across all active suppliers with credentials.
 * Calls AO/LM APIs in parallel and merges results.
 * Falls back to local DB search on API failure.
 */
export async function searchSupplierProductsLive(
  query: string,
  options?: {
    supplierId?: string
    limit?: number
  }
): Promise<ActionResult<Array<{
  supplier_id: string
  supplier_name: string
  supplier_code: string
  supplier_sku: string
  product_name: string
  cost_price: number
  list_price: number | null
  estimated_sale_price: number
  unit: string
  is_available: boolean
  stock_quantity: number | null
  delivery_days: number | null
  image_url: string | null
  source: 'live' | 'cache'
}>>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const sanitized = sanitizeSearchTerm(query)
    if (!sanitized || sanitized.length < 2) {
      return { success: true, data: [] }
    }

    // Get global product margin for pricing
    const calcResult = await getCalculationSettings()
    const defaultMargin = calcResult.success && calcResult.data
      ? calcResult.data.margins.products
      : CALC_DEFAULTS.MARGINS.PRODUCTS

    // Find active suppliers with API credentials
    let supplierQuery = supabase
      .from('suppliers')
      .select(`
        id,
        name,
        code,
        supplier_credentials!inner (
          id,
          credential_type,
          is_active
        )
      `)
      .eq('is_active', true)
      .eq('supplier_credentials.is_active', true)
      .eq('supplier_credentials.credential_type', 'api')

    if (options?.supplierId) {
      validateUUID(options.supplierId, 'leverandør ID')
      supplierQuery = supplierQuery.eq('id', options.supplierId)
    }

    const { data: suppliers } = await supplierQuery

    if (!suppliers || suppliers.length === 0) {
      // No suppliers with API credentials — fallback to local DB
      const fallback = await searchSupplierProductsForOffer(query, { limit: options?.limit })
      if (!fallback.success || !fallback.data) return { success: true, data: [] }
      return {
        success: true,
        data: fallback.data.map((p) => ({
          supplier_id: p.supplier_id,
          supplier_name: p.supplier_name,
          supplier_code: p.supplier_code,
          supplier_sku: p.supplier_sku,
          product_name: p.product_name,
          cost_price: p.cost_price,
          list_price: p.list_price,
          estimated_sale_price: p.estimated_sale_price,
          unit: p.unit,
          is_available: p.is_available,
          stock_quantity: null,
          delivery_days: null,
          image_url: null,
          source: 'cache' as const,
        })),
      }
    }

    const limit = options?.limit || 10
    const { SupplierAPIClientFactory } = await import('@/lib/services/supplier-api-client')

    // Search all suppliers in parallel
    const searchPromises = suppliers.map(async (supplier) => {
      try {
        const client = await SupplierAPIClientFactory.getClient(supplier.id, supplier.code)
        if (!client) return []

        const result = await client.searchProducts({
          query: sanitized,
          limit,
        })

        return result.products.map((p) => ({
          supplier_id: supplier.id,
          supplier_name: supplier.name,
          supplier_code: supplier.code,
          supplier_sku: p.sku,
          product_name: p.name,
          cost_price: p.costPrice,
          list_price: p.listPrice,
          estimated_sale_price: Math.round(p.costPrice * (1 + defaultMargin / 100) * 100) / 100,
          unit: p.unit,
          is_available: p.isAvailable,
          stock_quantity: p.stockQuantity,
          delivery_days: p.leadTimeDays,
          image_url: null as string | null,
          source: 'live' as const,
        }))
      } catch (err) {
        logger.error(`Live search failed for ${supplier.name}`, { error: err })
        return []
      }
    })

    const results = await Promise.allSettled(searchPromises)
    const allProducts = results.flatMap((r) =>
      r.status === 'fulfilled' ? r.value : []
    )

    // If no live results, fallback to local DB
    if (allProducts.length === 0) {
      const fallback = await searchSupplierProductsForOffer(query, { limit: options?.limit })
      if (!fallback.success || !fallback.data) return { success: true, data: [] }
      return {
        success: true,
        data: fallback.data.map((p) => ({
          supplier_id: p.supplier_id,
          supplier_name: p.supplier_name,
          supplier_code: p.supplier_code,
          supplier_sku: p.supplier_sku,
          product_name: p.product_name,
          cost_price: p.cost_price,
          list_price: p.list_price,
          estimated_sale_price: p.estimated_sale_price,
          unit: p.unit,
          is_available: p.is_available,
          stock_quantity: null,
          delivery_days: null,
          image_url: null,
          source: 'cache' as const,
        })),
      }
    }

    return { success: true, data: allProducts.slice(0, limit * 2) }
  } catch (err) {
    return { success: false, error: formatError(err, 'Live søgning fejlede') }
  }
}

/**
 * Update line item with fresh supplier price.
 * Recalculates the unit price based on current supplier cost and margin.
 */
export async function refreshLineItemPrice(
  lineItemId: string
): Promise<ActionResult<OfferLineItem>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(lineItemId, 'linje ID')

    // Get line item with supplier product link
    const { data: lineItem, error: liError } = await supabase
      .from('offer_line_items')
      .select(`
        id,
        offer_id,
        quantity,
        discount_percentage,
        supplier_product_id,
        supplier_margin_applied,
        offers!inner (
          customer_id
        )
      `)
      .eq('id', lineItemId)
      .maybeSingle()

    if (liError || !lineItem) {
      return { success: false, error: 'Linje ikke fundet' }
    }

    if (!lineItem.supplier_product_id) {
      return { success: false, error: 'Linjen er ikke knyttet til et leverandør produkt' }
    }

    // Get current supplier product price
    const { data: supplierProduct, error: spError } = await supabase
      .from('supplier_products')
      .select('cost_price, supplier_id')
      .eq('id', lineItem.supplier_product_id)
      .maybeSingle()

    if (spError || !supplierProduct?.cost_price) {
      return { success: false, error: 'Kunne ikke hente leverandør pris' }
    }

    // Get customer-specific pricing if applicable
    const offerInfo = Array.isArray(lineItem.offers) ? lineItem.offers[0] : lineItem.offers
    let effectiveCostPrice = supplierProduct.cost_price
    let marginPercentage = lineItem.supplier_margin_applied || CALC_DEFAULTS.MARGINS.MATERIALS

    if (offerInfo?.customer_id) {
      const { data: customerPricing } = await supabase
        .from('customer_supplier_prices')
        .select('discount_percentage, custom_margin_percentage')
        .eq('customer_id', offerInfo.customer_id)
        .eq('supplier_id', supplierProduct.supplier_id)
        .eq('is_active', true)
        .maybeSingle()

      if (customerPricing) {
        if (customerPricing.discount_percentage) {
          effectiveCostPrice = supplierProduct.cost_price * (1 - customerPricing.discount_percentage / 100)
        }
        if (customerPricing.custom_margin_percentage !== null) {
          marginPercentage = customerPricing.custom_margin_percentage
        }
      }
    }

    // Calculate new price
    const newUnitPrice = Math.round(effectiveCostPrice * (1 + marginPercentage / 100) * 100) / 100
    const discount = lineItem.discount_percentage || 0
    const total = lineItem.quantity * newUnitPrice * (1 - discount / 100)

    // Update line item
    const { data, error } = await supabase
      .from('offer_line_items')
      .update({
        unit_price: newUnitPrice,
        total,
        supplier_cost_price_at_creation: supplierProduct.cost_price,
        supplier_margin_applied: marginPercentage,
      })
      .eq('id', lineItemId)
      .select()
      .single()

    if (error) {
      logger.error('Database error updating line item price', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    await logOfferActivity(
      lineItem.offer_id,
      'updated',
      `Pris opdateret fra leverandør`,
      userId
    )

    revalidatePath(`/offers/${lineItem.offer_id}`)
    return { success: true, data: data as OfferLineItem }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere pris') }
  }
}
