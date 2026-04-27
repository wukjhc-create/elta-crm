'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAnonClient } from '@/lib/supabase/server'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { headers } from 'next/headers'
import { logOfferActivity } from '@/lib/actions/offer-activities'
import { createProjectFromOffer } from '@/lib/actions/projects'
import { triggerWebhooks, buildOfferWebhookPayload } from '@/lib/actions/integrations'
import { sendEmail } from '@/lib/email/email-service'
import { isGraphConfigured, sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import { getSmtpSettings, getCompanySettings } from '@/lib/actions/settings'
import { MAX_FILE_SIZE, APP_URL } from '@/lib/constants'
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
    const supabase = createAnonClient()

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
      .maybeSingle()

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

    const supabase = createAnonClient()
    const customerId = sessionResult.data.customer_id

    const { data: offers, error } = await supabase
      .from('offers')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['sent', 'viewed', 'accepted', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(100)

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

    const supabase = createAnonClient()
    const customerId = sessionResult.data.customer_id

    const { data: offer, error } = await supabase
      .from('offers')
      .select('*')
      .eq('id', offerId)
      .eq('customer_id', customerId)
      .maybeSingle()

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

      // Log view activity — use anon client directly
      await supabase.from('offer_activities').insert({
        offer_id: offerId,
        activity_type: 'viewed',
        description: 'Tilbud åbnet i kundeportalen',
        performed_by: null,
        metadata: { viewedViaPortal: true },
      })

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
      .maybeSingle()

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

    const supabase = createAnonClient()
    const customerId = sessionResult.data.customer_id

    // Verify offer belongs to customer and get details for project creation
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('id, status, customer_id, title, final_amount')
      .eq('id', data.offer_id)
      .eq('customer_id', customerId)
      .maybeSingle()

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

    // Log acceptance activity — use anon client directly (not logOfferActivity which uses cookie-based client)
    await supabase.from('offer_activities').insert({
      offer_id: data.offer_id,
      activity_type: 'accepted',
      description: `Tilbud accepteret af ${data.signer_name} (${data.signer_email})`,
      performed_by: null,
      metadata: { signerName: data.signer_name, signerEmail: data.signer_email, signerIp: clientIp },
    })

    // Auto-create project from accepted offer (non-critical — runs in authenticated context)
    try {
      const projectResult = await createProjectFromOffer(
        data.offer_id,
        customerId,
        offer.title,
        offer.final_amount
      )

      if (projectResult.success && projectResult.data) {
        await supabase.from('offer_activities').insert({
          offer_id: data.offer_id,
          activity_type: 'project_created',
          description: `Projekt ${projectResult.data.project_number} oprettet automatisk`,
          performed_by: null,
          metadata: { projectId: projectResult.data.id, projectNumber: projectResult.data.project_number },
        })
      } else {
        logger.error('Error auto-creating project', { error: projectResult.error })
      }
    } catch (projectError) {
      logger.error('Project creation failed (non-critical)', { error: projectError })
      // Don't fail the offer acceptance if project creation fails
    }

    // Trigger webhooks for offer.accepted
    const payload = await buildOfferWebhookPayload(data.offer_id, 'offer.accepted')
    if (payload) {
      triggerWebhooks('offer.accepted', payload).catch(err => {
        logger.error('Error triggering webhooks', { error: err })
      })
    }

    // Send automatic email confirmation to CRM mailbox
    try {
      const [smtpResult, settingsResult] = await Promise.all([
        getSmtpSettings(),
        getCompanySettings(),
      ])
      const crmMailbox = process.env.GRAPH_MAILBOX || 'kontakt@eltasolar.dk'
      const companyName = settingsResult.data?.company_name || 'Elta Solar'

      const smtpConfig = smtpResult.success && smtpResult.data
        ? {
            host: smtpResult.data.host || undefined,
            port: smtpResult.data.port || undefined,
            user: smtpResult.data.user || undefined,
            password: smtpResult.data.password || undefined,
            fromEmail: smtpResult.data.fromEmail || undefined,
            fromName: smtpResult.data.fromName || undefined,
          }
        : undefined

      await sendEmail({
        to: crmMailbox,
        subject: `Tilbud accepteret: ${offer.title}`,
        html: `
          <h2>Tilbud accepteret</h2>
          <p>Kunden har accepteret et tilbud via kundeportalen.</p>
          <table style="border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:4px 16px 4px 0;color:#666;">Tilbud:</td><td style="font-weight:600;">${offer.title}</td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#666;">Underskrevet af:</td><td>${data.signer_name} (${data.signer_email})</td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#666;">Beløb:</td><td style="font-weight:600;">${new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(offer.final_amount)}</td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#666;">Tidspunkt:</td><td>${new Date().toLocaleString('da-DK')}</td></tr>
          </table>
          <p>Se tilbuddet i CRM: <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://elta-crm.vercel.app'}/dashboard/offers">Gå til Tilbud</a></p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
          <p style="color:#999;font-size:12px;">Denne email er automatisk genereret af ${companyName} CRM.</p>
        `,
        text: `Tilbud accepteret\n\nKunden har accepteret tilbud: ${offer.title}\nUnderskrevet af: ${data.signer_name} (${data.signer_email})\nBeløb: ${offer.final_amount} DKK\nTidspunkt: ${new Date().toLocaleString('da-DK')}\n\nSe tilbuddet i CRM-systemet.`,
      }, smtpConfig)
    } catch (emailError) {
      logger.error('Failed to send acceptance confirmation email', { error: emailError })
      // Non-critical — don't fail the acceptance
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

    const supabase = createAnonClient()
    const customerId = sessionResult.data.customer_id

    // Verify offer belongs to customer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('id, status, customer_id, title')
      .eq('id', offerId)
      .eq('customer_id', customerId)
      .maybeSingle()

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

    // Log rejection activity — use anon client directly
    await supabase.from('offer_activities').insert({
      offer_id: offerId,
      activity_type: 'rejected',
      description: safeReason ? `Tilbud afvist: ${safeReason}` : 'Tilbud afvist',
      performed_by: null,
      metadata: { reason: safeReason || null },
    })

    // Trigger webhooks for offer.rejected
    const payload = await buildOfferWebhookPayload(offerId, 'offer.rejected')
    if (payload) {
      triggerWebhooks('offer.rejected', payload).catch(err => {
        logger.error('Error triggering webhooks', { error: err })
      })
    }

    // Send email notification to CRM mailbox (non-critical)
    try {
      const crmMailbox = process.env.GRAPH_MAILBOX || 'kontakt@eltasolar.dk'
      const subject = `Tilbud afvist: ${offer.title || offer.id}`
      const html = `
        <h2>Tilbud afvist</h2>
        <p>Kunden har afvist et tilbud via kundeportalen.</p>
        ${safeReason ? `<p><strong>Begrundelse:</strong> ${safeReason}</p>` : '<p>Ingen begrundelse angivet.</p>'}
        <p>Se tilbuddet i CRM: <a href="${(process.env.NEXT_PUBLIC_APP_URL || 'https://elta-crm.vercel.app').trim()}/dashboard/offers">Gå til Tilbud</a></p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
        <p style="color:#999;font-size:12px;">Denne email er automatisk genereret af Elta Solar CRM.</p>
      `
      const text = `Tilbud afvist\n\n${safeReason ? `Begrundelse: ${safeReason}` : 'Ingen begrundelse.'}\n\nSe tilbuddet i CRM-systemet.`

      if (isGraphConfigured()) {
        await sendEmailViaGraph({ to: crmMailbox, subject, html, text })
      } else {
        await sendEmail({ to: crmMailbox, subject, html, text })
      }
    } catch (emailError) {
      logger.error('Failed to send rejection notification', { error: emailError })
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

    const supabase = createAnonClient()
    const customerId = sessionResult.data.customer_id

    // Note: Portal context uses anon role — do NOT join profiles (no anon access).
    // sender_name is stored directly on portal_messages so we don't need the join.
    let query = supabase
      .from('portal_messages')
      .select('*')
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

    const supabase = createAnonClient()
    const customerId = sessionResult.data.customer_id

    // Verify customer_id matches token
    if (data.customer_id !== customerId) {
      return { success: false, error: 'Ugyldig kunde' }
    }

    const senderName = data.sender_name || sessionResult.data.customer.contact_person
    const { data: message, error } = await supabase
      .from('portal_messages')
      .insert({
        customer_id: customerId,
        offer_id: data.offer_id || null,
        sender_type: 'customer',
        sender_name: senderName,
        message: data.message,
        attachments: data.attachments || [],
      })
      .select()
      .single()

    if (error) {
      logger.error('Error sending portal message', { error: error })
      return { success: false, error: 'Kunne ikke sende besked' }
    }

    // Send email notification to CRM mailbox (non-critical)
    try {
      const crmMailbox = process.env.GRAPH_MAILBOX || 'kontakt@eltasolar.dk'
      const companyName = sessionResult.data.customer.company_name || 'Kunde'
      const contactPerson = sessionResult.data.customer.contact_person || 'Kunde'
      const subject = `Ny besked fra ${contactPerson} (${companyName})`
      const html = `
        <h2>Ny besked fra kundeportalen</h2>
        <p><strong>${contactPerson}</strong> fra <strong>${companyName}</strong> har sendt en besked:</p>
        <blockquote style="border-left:4px solid #2D8A2D;padding:12px 16px;margin:16px 0;background:#f8f9fa;color:#374151;">
          ${data.message.replace(/\n/g, '<br />')}
        </blockquote>
        ${data.attachments && data.attachments.length > 0 ? `<p style="color:#666;">Vedhæftede filer: ${data.attachments.length}</p>` : ''}
        <p>Svar kunden i CRM: <a href="${(process.env.NEXT_PUBLIC_APP_URL || 'https://elta-crm.vercel.app').trim()}/dashboard/customers">Gå til Kunder</a></p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
        <p style="color:#999;font-size:12px;">Denne email er automatisk genereret af Elta Solar CRM.</p>
      `
      const text = `Ny besked fra ${contactPerson} (${companyName}):\n\n${data.message}\n\nSvar kunden i CRM-systemet.`

      if (isGraphConfigured()) {
        await sendEmailViaGraph({ to: crmMailbox, subject, html, text })
      } else {
        await sendEmail({ to: crmMailbox, subject, html, text })
      }
    } catch (emailError) {
      logger.error('Failed to send portal message notification', { error: emailError })
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
      .maybeSingle()

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

    const supabase = createAnonClient()

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
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('portal_messages')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })

    if (offerId) {
      query = query.eq('offer_id', offerId)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Error fetching customer portal messages', { error })
      return { success: false, error: `Kunne ikke hente beskeder: ${error.message}` }
    }

    return { success: true, data: (data || []) as PortalMessageWithRelations[] }
  } catch (error) {
    logger.error('Error in getCustomerPortalMessages', { error })
    return { success: false, error: `Fejl ved hentning: ${error instanceof Error ? error.message : 'Ukendt fejl'}` }
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

    const supabase = createAnonClient()

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
    const supabase = createAnonClient()

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

// =====================================================
// Portal Documents
// =====================================================

export interface PortalDocument {
  id: string
  title: string
  description: string | null
  document_type: string
  file_url: string
  file_name: string
  mime_type: string
  created_at: string
}

// Get documents visible to portal customer
export async function getPortalDocuments(
  token: string
): Promise<ActionResult<PortalDocument[]>> {
  try {
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = createAnonClient()
    const customerId = sessionResult.data.customer_id

    const { data, error } = await supabase
      .from('customer_documents')
      .select('id, title, description, document_type, file_url, file_name, mime_type, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching portal documents', { error })
      return { success: false, error: 'Kunne ikke hente dokumenter' }
    }

    return { success: true, data: data as PortalDocument[] }
  } catch (error) {
    logger.error('Error in getPortalDocuments', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Portal Besigtigelse Booking
// =====================================================

export interface PortalBesigtigelse {
  id: string
  customer_id: string
  title: string
  description: string | null
  due_date: string
  status: string
  created_at: string
}

/**
 * Book a besigtigelse from the customer portal (no auth required — uses token).
 */
export async function portalBookBesigtigelse(
  token: string,
  date: string,
  timeSlot: string,
  notes?: string
): Promise<ActionResult<{ taskId: string }>> {
  try {
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const session = sessionResult.data
    const supabase = createAnonClient()

    const formattedDate = new Date(date).toLocaleDateString('da-DK', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })

    // Fetch customer address for ICS location
    const { data: customer } = await supabase
      .from('customers')
      .select('billing_address, billing_city, billing_postal_code, shipping_address, shipping_city, shipping_postal_code')
      .eq('id', session.customer_id)
      .single()

    const address = customer?.shipping_address || customer?.billing_address || ''
    const city = customer?.shipping_city || customer?.billing_city || ''
    const postal = customer?.shipping_postal_code || customer?.billing_postal_code || ''
    const fullAddress = [address, `${postal} ${city}`.trim()].filter(Boolean).join(', ')

    const portalUrl = `${APP_URL}/portal/${token}`

    const description = [
      `PORTAL-BOOKING: Besigtigelse anmodet af kunden via portalen.`,
      `Dato: ${formattedDate}`,
      `Tidspunkt: ${timeSlot}`,
      fullAddress ? `Adresse: ${fullAddress}` : null,
      notes ? `Kundens besked: ${notes}` : null,
    ].filter(Boolean).join('\n')

    // Create task in CRM
    const { data: task, error: taskError } = await supabase
      .from('customer_tasks')
      .insert({
        customer_id: session.customer_id,
        title: `PORTAL: Besigtigelse anmodet — ${session.customer.company_name}`,
        description,
        status: 'pending',
        priority: 'high',
        due_date: date,
        created_by: session.customer_id, // customer-initiated
      })
      .select('id')
      .single()

    if (taskError) {
      logger.error('Portal besigtigelse: failed to create task', { error: taskError })
      return { success: false, error: 'Kunne ikke oprette booking' }
    }

    // Send confirmation email with ICS attachment
    try {
      const { sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
      const { generateBesigtigelseICS, extractStartTimeFromSlot } = await import('@/lib/utils/ics')

      const icsContent = generateBesigtigelseICS({
        title: 'Besigtigelse: Elta Solar',
        location: fullAddress || undefined,
        description: `Vi glæder os til at se dig. Du kan altid finde dine dokumenter og detaljer her: ${portalUrl}`,
        startDate: date,
        startTime: extractStartTimeFromSlot(timeSlot),
      })

      const emailHtml = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">Besigtigelse — Bekræftelse</h1>
          </div>
          <div style="padding: 32px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px; color: #111827;">Kære ${session.customer.contact_person},</p>
            <p style="color: #374151;">Tak for din booking af besigtigelse. Vi har modtaget din anmodning:</p>
            <div style="background: #f0f9ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 4px 0; color: #1e40af;"><strong>Dato:</strong> ${formattedDate}</p>
              <p style="margin: 4px 0; color: #1e40af;"><strong>Tidspunkt:</strong> ${timeSlot}</p>
              ${fullAddress ? `<p style="margin: 4px 0; color: #1e40af;"><strong>Adresse:</strong> ${fullAddress}</p>` : ''}
              ${notes ? `<p style="margin: 4px 0; color: #1e40af;"><strong>Din besked:</strong> ${notes}</p>` : ''}
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
              <tr>
                <td align="center">
                  <a href="${portalUrl}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#1e40af;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">
                    Se din besigtigelse i kundeportalen
                  </a>
                </td>
              </tr>
            </table>
            <p style="color: #374151;">Vi vender tilbage med en endelig bekræftelse hurtigst muligt.</p>
            <p style="color: #374151; margin-top: 24px;">Med venlig hilsen,<br/><strong>Elta Solar</strong></p>
          </div>
        </div>
      `

      await sendEmailViaGraph({
        to: session.customer.email,
        subject: `Bekræftelse: Besigtigelse d. ${formattedDate}`,
        html: emailHtml,
        attachments: [
          {
            filename: 'besigtigelse.ics',
            content: Buffer.from(icsContent, 'utf-8'),
            contentType: 'text/calendar',
          },
        ],
      })
    } catch (emailErr) {
      // Non-critical — task is created, email is a bonus
      logger.error('Portal besigtigelse: email failed', { error: emailErr })
    }

    return { success: true, data: { taskId: task.id } }
  } catch (error) {
    logger.error('Error in portalBookBesigtigelse', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/**
 * Get existing besigtigelse bookings for portal customer.
 * Broad matching: any task with 'besigtigelse' in title or description,
 * or with 'Besigtigelse' anywhere in the task.
 * Falls back to returning ALL tasks with a due_date for the customer.
 */
export async function getPortalBesigtigelser(
  token: string
): Promise<ActionResult<PortalBesigtigelse[]>> {
  try {
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const customerId = sessionResult.data.customer_id

    // Use admin client to bypass RLS — token already validated above so this is safe
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Query ALL tasks for this customer (no status filter — confirmed tasks should still show)
    const { data: allTasks, error: taskErr } = await supabase
      .from('customer_tasks')
      .select('id, customer_id, title, description, due_date, status, created_at')
      .eq('customer_id', customerId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20)

    if (taskErr) {
      logger.error('Error fetching portal besigtigelser', { error: taskErr })
      return { success: false, error: 'Kunne ikke hente besigtigelser' }
    }

    const tasks = allTasks || []
    // Debug: log task count for portal

    // Prioritize tasks with "besigtigelse" in title/description
    const besigTasks = tasks.filter(
      (t) =>
        t.title?.toLowerCase().includes('esigtigelse') ||
        t.description?.toLowerCase().includes('esigtigelse')
    )

    if (besigTasks.length > 0) {
      return { success: true, data: besigTasks as PortalBesigtigelse[] }
    }

    // Fallback: any task with a due_date
    const tasksWithDate = tasks.filter((t) => t.due_date)
    if (tasksWithDate.length > 0) {
      return { success: true, data: tasksWithDate as PortalBesigtigelse[] }
    }

    // Last resort: return ALL tasks so the portal shows something
    return { success: true, data: tasks as PortalBesigtigelse[] }
  } catch (error) {
    logger.error('Error in getPortalBesigtigelser', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/**
 * Customer confirms the proposed besigtigelse time via portal.
 * Updates the task status to 'in_progress' (= Bekræftet).
 * Sends a "Tak for bekræftelsen" email.
 */
export async function portalConfirmBesigtigelse(
  token: string,
  taskId: string
): Promise<ActionResult> {
  try {
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const session = sessionResult.data

    // Use admin client — token already validated, bypasses RLS issues with anon
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Verify task belongs to this customer and fetch full details
    const { data: task, error: fetchErr } = await supabase
      .from('customer_tasks')
      .select('id, customer_id, status, description, due_date')
      .eq('id', taskId)
      .eq('customer_id', session.customer_id)
      .single()

    if (fetchErr || !task) {
      return { success: false, error: 'Besigtigelse ikke fundet' }
    }

    // Extract time from description
    const timeMatch = task.description?.match(/Tidspunkt:\s*(.+)/i) || task.description?.match(/kl\.\s*(\S+)/)
    const timeSlot = timeMatch ? timeMatch[1].trim() : null

    const confirmDate = new Date().toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })

    const updatedDesc = [
      task.description || '',
      `\n✓ BEKRÆFTET af kunden via portalen d. ${confirmDate}`,
    ].filter(Boolean).join('\n')

    const { error: updateErr } = await supabase
      .from('customer_tasks')
      .update({
        status: 'in_progress',
        description: updatedDesc,
      })
      .eq('id', taskId)

    if (updateErr) {
      logger.error('Portal confirm besigtigelse: update failed', { error: updateErr })
      return { success: false, error: 'Kunne ikke bekræfte besigtigelsen' }
    }

    // Format date for email
    const formattedDate = task.due_date
      ? new Date(task.due_date).toLocaleDateString('da-DK', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null

    // Create system alert for notification bell
    try {
      const { createSystemAlertAdmin } = await import('@/lib/actions/system-alerts-admin')
      await createSystemAlertAdmin({
        alert_type: 'besigtigelse_confirmed',
        severity: 'info',
        title: 'Besigtigelse bekræftet',
        message: `${session.customer.contact_person} har bekræftet besigtigelsen${formattedDate ? ` d. ${formattedDate}` : ''}.`,
        details: { customer_id: session.customer_id, task_id: taskId },
        entity_type: 'customer',
        entity_id: session.customer_id,
      })
    } catch {
      // Non-critical
    }

    // Send "Tak for bekræftelsen" email
    try {
      const { sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')

      const portalUrl = `${APP_URL}/portal/${token}`

      const emailHtml = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #166534; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">Tak for din bekræftelse</h1>
          </div>
          <div style="padding: 32px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px; color: #111827;">Kære ${session.customer.contact_person},</p>
            <p style="color: #374151;">Tak for din bekræftelse af besigtigelsen. Vi ses som aftalt:</p>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              ${formattedDate ? `<p style="margin: 4px 0; color: #166534;"><strong>Dato:</strong> ${formattedDate}</p>` : ''}
              ${timeSlot ? `<p style="margin: 4px 0; color: #166534;"><strong>Tidspunkt:</strong> ${timeSlot}</p>` : ''}
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
              <tr>
                <td align="center">
                  <a href="${portalUrl}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#1e40af;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">
                    Se detaljer i kundeportalen
                  </a>
                </td>
              </tr>
            </table>
            <p style="color: #374151;">Har du spørgsmål er du velkommen til at kontakte os.</p>
            <p style="color: #374151; margin-top: 24px;">Med venlig hilsen,<br/><strong>Elta Solar</strong></p>
          </div>
        </div>
      `

      const subject = formattedDate
        ? `Tak for din bekræftelse — vi ses d. ${formattedDate}`
        : 'Tak for din bekræftelse af besigtigelsen'

      await sendEmailViaGraph({
        to: session.customer.email,
        subject,
        html: emailHtml,
      })
    } catch (emailErr) {
      // Non-critical — confirmation is saved, email is a bonus
      logger.error('Portal confirm besigtigelse: email failed', { error: emailErr })
    }

    // Revalidate so Status & Flow updates
    revalidatePath(`/dashboard/customers/${session.customer_id}`)

    return { success: true }
  } catch (error) {
    logger.error('Error in portalConfirmBesigtigelse', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/**
 * Customer requests to reschedule a besigtigelse via portal.
 * Creates a new task in CRM with the customer's message.
 */
export async function portalRequestReschedule(
  token: string,
  taskId: string,
  message: string
): Promise<ActionResult> {
  try {
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const session = sessionResult.data

    // Use admin client — token already validated
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Verify task belongs to this customer
    const { data: task, error: fetchErr } = await supabase
      .from('customer_tasks')
      .select('id, customer_id, due_date')
      .eq('id', taskId)
      .eq('customer_id', session.customer_id)
      .single()

    if (fetchErr || !task) {
      return { success: false, error: 'Besigtigelse ikke fundet' }
    }

    // Create a new task for the CRM user
    const { error: insertErr } = await supabase
      .from('customer_tasks')
      .insert({
        customer_id: session.customer_id,
        title: `KUNDE ØNSKER FLYTNING: ${session.customer.company_name}`,
        description: [
          `Kunden har anmodet om flytning af besigtigelse via portalen.`,
          `Nuværende dato: ${task.due_date || 'Ikke sat'}`,
          `Kundens besked: ${message}`,
        ].join('\n'),
        status: 'pending',
        priority: 'high',
        created_by: session.customer_id,
      })

    if (insertErr) {
      logger.error('Portal reschedule: task creation failed', { error: insertErr })
      return { success: false, error: 'Kunne ikke sende anmodningen' }
    }

    return { success: true }
  } catch (error) {
    logger.error('Error in portalRequestReschedule', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}
