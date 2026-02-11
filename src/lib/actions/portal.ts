'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { headers } from 'next/headers'
import { logOfferActivity } from '@/lib/actions/offer-activities'
import { createProjectFromOffer } from '@/lib/actions/projects'
import { triggerWebhooks, buildOfferWebhookPayload } from '@/lib/actions/integrations'
import { MAX_FILE_SIZE } from '@/lib/constants'
import type {
  PortalAccessToken,
  PortalAccessTokenWithCustomer,
  PortalSession,
  PortalOffer,
  PortalMessage,
  PortalMessageWithRelations,
  OfferSignature,
  CreatePortalTokenData,
  SendPortalMessageData,
  AcceptOfferData,
  PortalAttachment,
  UploadAttachmentResult,
} from '@/types/portal.types'
import type { ActionResult } from '@/types/common.types'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Portal Token Management (for employees)
// =====================================================

// Create portal access token for a customer
export async function createPortalToken(
  data: CreatePortalTokenData
): Promise<ActionResult<PortalAccessToken>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Generate secure token
    const tokenBytes = new Uint8Array(32)
    crypto.getRandomValues(tokenBytes)
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const { data: tokenData, error } = await supabase
      .from('portal_access_tokens')
      .insert({
        customer_id: data.customer_id,
        email: data.email,
        token,
        expires_at: data.expires_at || null,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      logger.error('Error creating portal token', { error: error })
      return { success: false, error: 'Kunne ikke oprette portal-adgang' }
    }

    revalidatePath('/customers')
    return { success: true, data: tokenData as PortalAccessToken }
  } catch (error) {
    logger.error('Error in createPortalToken', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get portal tokens for a customer
export async function getPortalTokens(
  customerId: string
): Promise<ActionResult<PortalAccessToken[]>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('portal_access_tokens')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching portal tokens', { error: error })
      return { success: false, error: 'Kunne ikke hente portal-adgange' }
    }

    return { success: true, data: data as PortalAccessToken[] }
  } catch (error) {
    logger.error('Error in getPortalTokens', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Deactivate portal token
export async function deactivatePortalToken(
  tokenId: string
): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('portal_access_tokens')
      .update({ is_active: false })
      .eq('id', tokenId)

    if (error) {
      logger.error('Error deactivating token', { error: error })
      return { success: false, error: 'Kunne ikke deaktivere adgang' }
    }

    revalidatePath('/customers')
    return { success: true }
  } catch (error) {
    logger.error('Error in deactivatePortalToken', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Portal Access (for customers via token)
// =====================================================

// Validate portal token and get session
export async function validatePortalToken(
  token: string
): Promise<ActionResult<PortalSession>> {
  try {
    const supabase = await createClient()

    const { data: tokenData, error } = await supabase
      .from('portal_access_tokens')
      .select(`
        *,
        customer:customers(
          id,
          customer_number,
          company_name,
          contact_person,
          email
        )
      `)
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (error || !tokenData) {
      return { success: false, error: 'Ugyldig eller udløbet adgang' }
    }

    // Check if token is expired
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return { success: false, error: 'Adgangen er udløbet' }
    }

    // Update last accessed timestamp
    await supabase
      .from('portal_access_tokens')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', tokenData.id)

    const session: PortalSession = {
      token: tokenData.token,
      customer_id: tokenData.customer_id,
      customer: tokenData.customer,
      expires_at: tokenData.expires_at,
    }

    return { success: true, data: session }
  } catch (error) {
    logger.error('Error in validatePortalToken', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get offers for customer (portal view)
export async function getPortalOffers(
  token: string
): Promise<ActionResult<PortalOffer[]>> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()
    const customerId = sessionResult.data.customer_id

    const { data: offers, error } = await supabase
      .from('offers')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['sent', 'viewed', 'accepted', 'rejected'])
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching portal offers', { error: error })
      return { success: false, error: 'Kunne ikke hente tilbud' }
    }

    if (!offers || offers.length === 0) {
      return { success: true, data: [] }
    }

    // Get all offer IDs for batch queries
    const offerIds = offers.map((o) => o.id)

    // Batch fetch all line items and signatures (avoids N+1 queries)
    const [lineItemsResult, signaturesResult] = await Promise.all([
      supabase
        .from('offer_line_items')
        .select('*')
        .in('offer_id', offerIds)
        .order('position'),
      supabase
        .from('offer_signatures')
        .select('*')
        .in('offer_id', offerIds),
    ])

    // Create lookup maps for efficient access
    type LineItem = NonNullable<typeof lineItemsResult.data>[number]
    type Signature = NonNullable<typeof signaturesResult.data>[number]
    const lineItemsByOffer = new Map<string, LineItem[]>()
    const signaturesByOffer = new Map<string, Signature | null>()

    lineItemsResult.data?.forEach((item) => {
      const existing = lineItemsByOffer.get(item.offer_id) || []
      existing.push(item)
      lineItemsByOffer.set(item.offer_id, existing)
    })

    signaturesResult.data?.forEach((sig) => {
      signaturesByOffer.set(sig.offer_id, sig)
    })

    // Build result without additional queries
    const offersWithItems: PortalOffer[] = offers.map((offer) => ({
      id: offer.id,
      offer_number: offer.offer_number,
      title: offer.title,
      description: offer.description,
      status: offer.status,
      total_amount: offer.total_amount,
      discount_percentage: offer.discount_percentage,
      discount_amount: offer.discount_amount,
      tax_percentage: offer.tax_percentage,
      tax_amount: offer.tax_amount,
      final_amount: offer.final_amount,
      currency: offer.currency,
      valid_until: offer.valid_until,
      terms_and_conditions: offer.terms_and_conditions,
      sent_at: offer.sent_at,
      viewed_at: offer.viewed_at,
      accepted_at: offer.accepted_at,
      rejected_at: offer.rejected_at,
      created_at: offer.created_at,
      line_items: lineItemsByOffer.get(offer.id) || [],
      signature: signaturesByOffer.get(offer.id) || null,
      sales_person: {
        full_name: null,
        email: '',
        phone: null,
      },
    }))

    return { success: true, data: offersWithItems }
  } catch (error) {
    logger.error('Error in getPortalOffers', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get single offer for portal
export async function getPortalOffer(
  token: string,
  offerId: string
): Promise<ActionResult<PortalOffer>> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()
    const customerId = sessionResult.data.customer_id

    const { data: offer, error } = await supabase
      .from('offers')
      .select('*')
      .eq('id', offerId)
      .eq('customer_id', customerId)
      .single()

    if (error || !offer) {
      logger.error('Error fetching offer', { error: error })
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    // Mark as viewed if first time
    if (!offer.viewed_at && offer.status === 'sent') {
      await supabase
        .from('offers')
        .update({
          viewed_at: new Date().toISOString(),
          status: 'viewed',
        })
        .eq('id', offerId)

      // Log view activity
      await logOfferActivity(
        offerId,
        'viewed',
        'Tilbud åbnet i kundeportalen',
        null,
        { viewedViaPortal: true }
      )

      // Trigger webhooks for offer.viewed
      const payload = await buildOfferWebhookPayload(offerId, 'offer.viewed')
      if (payload) {
        triggerWebhooks('offer.viewed', payload).catch(err => {
          logger.error('Error triggering webhooks', { error: err })
        })
      }
    }

    // Get line items
    const { data: lineItems } = await supabase
      .from('offer_line_items')
      .select('*')
      .eq('offer_id', offerId)
      .order('position')

    // Get signature if exists
    const { data: signature } = await supabase
      .from('offer_signatures')
      .select('*')
      .eq('offer_id', offerId)
      .single()

    const portalOffer: PortalOffer = {
      id: offer.id,
      offer_number: offer.offer_number,
      title: offer.title,
      description: offer.description,
      status: offer.status,
      total_amount: offer.total_amount,
      discount_percentage: offer.discount_percentage,
      discount_amount: offer.discount_amount,
      tax_percentage: offer.tax_percentage,
      tax_amount: offer.tax_amount,
      final_amount: offer.final_amount,
      currency: offer.currency,
      valid_until: offer.valid_until,
      terms_and_conditions: offer.terms_and_conditions,
      sent_at: offer.sent_at,
      viewed_at: offer.viewed_at,
      accepted_at: offer.accepted_at,
      rejected_at: offer.rejected_at,
      created_at: offer.created_at,
      line_items: lineItems || [],
      signature: signature || null,
      sales_person: {
        full_name: null,
        email: '',
        phone: null,
      },
    }

    return { success: true, data: portalOffer }
  } catch (error) {
    logger.error('Error in getPortalOffer', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Accept offer with signature
export async function acceptOffer(
  token: string,
  data: AcceptOfferData
): Promise<ActionResult> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()
    const customerId = sessionResult.data.customer_id

    // Verify offer belongs to customer and get details for project creation
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('id, status, customer_id, title, final_amount')
      .eq('id', data.offer_id)
      .eq('customer_id', customerId)
      .single()

    if (offerError || !offer) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    if (offer.status === 'accepted') {
      return { success: false, error: 'Tilbuddet er allerede accepteret' }
    }

    if (offer.status === 'rejected') {
      return { success: false, error: 'Tilbuddet er allerede afvist' }
    }

    // Get client IP
    const headersList = await headers()
    const clientIp = headersList.get('x-forwarded-for') ||
                     headersList.get('x-real-ip') ||
                     'unknown'

    // Create signature
    const { error: signatureError } = await supabase
      .from('offer_signatures')
      .insert({
        offer_id: data.offer_id,
        signer_name: data.signer_name,
        signer_email: data.signer_email,
        signer_ip: clientIp,
        signature_data: data.signature_data,
      })

    if (signatureError) {
      logger.error('Error creating signature', { error: signatureError })
      return { success: false, error: 'Kunne ikke gemme underskrift' }
    }

    // Update offer status
    const { error: updateError } = await supabase
      .from('offers')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', data.offer_id)

    if (updateError) {
      logger.error('Error updating offer', { error: updateError })
      return { success: false, error: 'Kunne ikke opdatere tilbud' }
    }

    // Log acceptance activity
    await logOfferActivity(
      data.offer_id,
      'accepted',
      `Tilbud accepteret af ${data.signer_name} (${data.signer_email})`,
      null, // No user ID for portal actions
      { signerName: data.signer_name, signerEmail: data.signer_email, signerIp: clientIp }
    )

    // Auto-create project from accepted offer
    const projectResult = await createProjectFromOffer(
      data.offer_id,
      customerId,
      offer.title,
      offer.final_amount
    )

    if (projectResult.success && projectResult.data) {
      // Log project creation activity
      await logOfferActivity(
        data.offer_id,
        'project_created',
        `Projekt ${projectResult.data.project_number} oprettet automatisk`,
        null,
        { projectId: projectResult.data.id, projectNumber: projectResult.data.project_number }
      )
    } else {
      logger.error('Error auto-creating project', { error: projectResult.error })
      // Don't fail the offer acceptance if project creation fails
    }

    // Trigger webhooks for offer.accepted
    const payload = await buildOfferWebhookPayload(data.offer_id, 'offer.accepted')
    if (payload) {
      triggerWebhooks('offer.accepted', payload).catch(err => {
        logger.error('Error triggering webhooks', { error: err })
      })
    }

    revalidatePath('/offers')
    revalidatePath('/projects')

    return { success: true }
  } catch (error) {
    logger.error('Error in acceptOffer', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Reject offer
export async function rejectOffer(
  token: string,
  offerId: string,
  reason?: string
): Promise<ActionResult> {
  try {
    // Validate and limit reason length
    const safeReason = reason?.slice(0, 2000) || undefined

    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()
    const customerId = sessionResult.data.customer_id

    // Verify offer belongs to customer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('id, status, customer_id')
      .eq('id', offerId)
      .eq('customer_id', customerId)
      .single()

    if (offerError || !offer) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    if (offer.status === 'accepted') {
      return { success: false, error: 'Tilbuddet er allerede accepteret' }
    }

    // Update offer status
    const { error: updateError } = await supabase
      .from('offers')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        notes: safeReason ? `Afvist med begrundelse: ${safeReason}` : undefined,
      })
      .eq('id', offerId)

    if (updateError) {
      logger.error('Error rejecting offer', { error: updateError })
      return { success: false, error: 'Kunne ikke afvise tilbud' }
    }

    // Log rejection activity
    await logOfferActivity(
      offerId,
      'rejected',
      safeReason ? `Tilbud afvist: ${safeReason}` : 'Tilbud afvist',
      null,
      { reason: safeReason || null }
    )

    // Trigger webhooks for offer.rejected
    const payload = await buildOfferWebhookPayload(offerId, 'offer.rejected')
    if (payload) {
      triggerWebhooks('offer.rejected', payload).catch(err => {
        logger.error('Error triggering webhooks', { error: err })
      })
    }

    revalidatePath('/offers')

    return { success: true }
  } catch (error) {
    logger.error('Error in rejectOffer', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Portal Messages
// =====================================================

// Get messages for portal (customer view)
export async function getPortalMessages(
  token: string,
  offerId?: string
): Promise<ActionResult<PortalMessageWithRelations[]>> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()
    const customerId = sessionResult.data.customer_id

    let query = supabase
      .from('portal_messages')
      .select(`
        *,
        sender:profiles(id, full_name, email),
        offer:offers(id, offer_number, title)
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })

    if (offerId) {
      query = query.eq('offer_id', offerId)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Error fetching portal messages', { error: error })
      return { success: false, error: 'Kunne ikke hente beskeder' }
    }

    return { success: true, data: data as PortalMessageWithRelations[] }
  } catch (error) {
    logger.error('Error in getPortalMessages', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Send message from portal (customer)
export async function sendPortalMessage(
  token: string,
  data: SendPortalMessageData
): Promise<ActionResult<PortalMessage>> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()
    const customerId = sessionResult.data.customer_id

    // Verify customer_id matches token
    if (data.customer_id !== customerId) {
      return { success: false, error: 'Ugyldig kunde' }
    }

    const { data: message, error } = await supabase
      .from('portal_messages')
      .insert({
        customer_id: customerId,
        offer_id: data.offer_id || null,
        sender_type: 'customer',
        sender_name: data.sender_name || sessionResult.data.customer.contact_person,
        message: data.message,
        attachments: data.attachments || [],
      })
      .select()
      .single()

    if (error) {
      logger.error('Error sending portal message', { error: error })
      return { success: false, error: 'Kunne ikke sende besked' }
    }

    return { success: true, data: message as PortalMessage }
  } catch (error) {
    logger.error('Error in sendPortalMessage', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Send message from employee to customer
export async function sendEmployeeMessage(
  customerId: string,
  message: string,
  offerId?: string,
  attachments?: PortalAttachment[]
): Promise<ActionResult<PortalMessage>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Get employee name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()

    const { data: messageData, error } = await supabase
      .from('portal_messages')
      .insert({
        customer_id: customerId,
        offer_id: offerId || null,
        sender_type: 'employee',
        sender_id: userId,
        sender_name: profile?.full_name || 'Medarbejder',
        message,
        attachments: attachments || [],
      })
      .select()
      .single()

    if (error) {
      logger.error('Error sending employee message', { error: error })
      return { success: false, error: 'Kunne ikke sende besked' }
    }

    revalidatePath('/customers')
    revalidatePath('/offers')
    return { success: true, data: messageData as PortalMessage }
  } catch (error) {
    logger.error('Error in sendEmployeeMessage', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Mark portal messages as read
export async function markPortalMessagesAsRead(
  token: string,
  messageIds: string[]
): Promise<ActionResult> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from('portal_messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', messageIds)
      .eq('sender_type', 'employee')

    if (error) {
      logger.error('Error marking messages as read', { error: error })
      return { success: false, error: 'Kunne ikke markere som læst' }
    }

    return { success: true }
  } catch (error) {
    logger.error('Error in markPortalMessagesAsRead', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get unread message count for employee view
export async function getUnreadPortalMessageCount(
  customerId?: string
): Promise<ActionResult<number>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    let query = supabase
      .from('portal_messages')
      .select('*', { count: 'exact', head: true })
      .eq('sender_type', 'customer')
      .is('read_at', null)

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    const { count, error } = await query

    if (error) {
      logger.error('Error fetching unread count', { error: error })
      return { success: false, error: 'Kunne ikke hente antal ulæste' }
    }

    return { success: true, data: count || 0 }
  } catch (error) {
    logger.error('Error in getUnreadPortalMessageCount', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get messages for a customer (employee view)
export async function getCustomerPortalMessages(
  customerId: string,
  offerId?: string
): Promise<ActionResult<PortalMessageWithRelations[]>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    let query = supabase
      .from('portal_messages')
      .select(`
        *,
        sender:profiles!portal_messages_sender_id_fkey (
          id,
          full_name,
          email
        ),
        offer:offers!portal_messages_offer_id_fkey (
          id,
          offer_number,
          title
        )
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })

    if (offerId) {
      query = query.eq('offer_id', offerId)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Error fetching customer portal messages', { error: error })
      return { success: false, error: 'Kunne ikke hente beskeder' }
    }

    return { success: true, data: data as PortalMessageWithRelations[] }
  } catch (error) {
    logger.error('Error in getCustomerPortalMessages', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Mark customer messages as read (employee view)
export async function markCustomerMessagesAsRead(
  messageIds: string[]
): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('portal_messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', messageIds)
      .eq('sender_type', 'customer')

    if (error) {
      logger.error('Error marking customer messages as read', { error: error })
      return { success: false, error: 'Kunne ikke markere som læst' }
    }

    return { success: true }
  } catch (error) {
    logger.error('Error in markCustomerMessagesAsRead', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Portal File Attachments
// =====================================================

/**
 * Upload a file attachment for portal chat (customer)
 */
export async function uploadPortalAttachment(
  token: string,
  formData: FormData
): Promise<ActionResult<UploadAttachmentResult>> {
  try {
    // Validate token
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const customerId = sessionResult.data.customer_id
    const file = formData.get('file') as File | null

    if (!file) {
      return { success: false, error: 'Ingen fil valgt' }
    }

    // Validate file size (10MB max)
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: 'Filen er for stor (max 10MB)' }
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ]

    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Filtypen er ikke tilladt' }
    }

    const supabase = await createClient()

    // Generate unique filename
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const path = `${customerId}/${timestamp}-${sanitizedName}`

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('portal-attachments')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      logger.error('Error uploading file', { error: uploadError })
      return { success: false, error: 'Kunne ikke uploade fil' }
    }

    // Get signed URL (valid for 1 hour)
    const { data: urlData } = await supabase.storage
      .from('portal-attachments')
      .createSignedUrl(path, 3600)

    return {
      success: true,
      data: {
        path: uploadData.path,
        url: urlData?.signedUrl || '',
        name: file.name,
        size: file.size,
        type: file.type,
      },
    }
  } catch (error) {
    logger.error('Error in uploadPortalAttachment', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/**
 * Upload a file attachment for portal chat (employee)
 */
export async function uploadEmployeeAttachment(
  customerId: string,
  formData: FormData
): Promise<ActionResult<UploadAttachmentResult>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const file = formData.get('file') as File | null

    if (!file) {
      return { success: false, error: 'Ingen fil valgt' }
    }

    // Validate file size (10MB max)
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: 'Filen er for stor (max 10MB)' }
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ]

    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Filtypen er ikke tilladt' }
    }

    // Generate unique filename
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const path = `${customerId}/${userId}-${timestamp}-${sanitizedName}`

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('portal-attachments')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      logger.error('Error uploading file', { error: uploadError })
      return { success: false, error: 'Kunne ikke uploade fil' }
    }

    // Get signed URL (valid for 1 hour)
    const { data: urlData } = await supabase.storage
      .from('portal-attachments')
      .createSignedUrl(path, 3600)

    return {
      success: true,
      data: {
        path: uploadData.path,
        url: urlData?.signedUrl || '',
        name: file.name,
        size: file.size,
        type: file.type,
      },
    }
  } catch (error) {
    logger.error('Error in uploadEmployeeAttachment', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/**
 * Get a fresh signed URL for an attachment
 */
export async function getAttachmentUrl(
  path: string
): Promise<ActionResult<string>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.storage
      .from('portal-attachments')
      .createSignedUrl(path, 3600) // 1 hour

    if (error) {
      logger.error('Error getting signed URL', { error: error })
      return { success: false, error: 'Kunne ikke hente fil-URL' }
    }

    return { success: true, data: data.signedUrl }
  } catch (error) {
    logger.error('Error in getAttachmentUrl', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}
