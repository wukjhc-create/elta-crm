'use server'

/**
 * EMAIL SERVER ACTIONS
 *
 * Complete email functionality:
 * - Template management
 * - Send offer emails with tracking
 * - Email thread management
 * - Open/click tracking
 * - Inbound email handling (stub)
 */

import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { revalidatePath } from 'next/cache'
import { isGraphConfigured, sendEmailViaGraph, getMailbox } from '@/lib/services/microsoft-graph'
import { getCompanySettings } from '@/lib/actions/settings'
import { logOfferActivity } from '@/lib/actions/offer-activities'
import { createPortalToken } from '@/lib/actions/portal'
import { logger } from '@/lib/utils/logger'
import { validateUUID } from '@/lib/validations/common'
import { APP_URL } from '@/lib/constants'
import { formatCurrency, formatDateLongDK } from '@/lib/utils/format'
import crypto from 'crypto'
import type {
  EmailTemplate,
  EmailTemplateCreate,
  EmailTemplateUpdate,
  EmailThread,
  EmailThreadWithRelations,
  EmailThreadCreate,
  EmailMessage,
  EmailMessageWithRelations,
  EmailMessageCreate,
  EmailEvent,
  EmailEventCreate,
  SendOfferEmailInput,
  SendOfferEmailResult,
  EmailPreview,
  GenerateEmailPreviewInput,
  OfferEmailVariables,
} from '@/types/email.types'

// =====================================================
// HELPER: Generate tracking ID
// =====================================================

function generateTrackingId(): string {
  return crypto.randomBytes(16).toString('hex')
}


// =====================================================
// HELPER: Render template with variables
// =====================================================

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    // Replace {{key}} patterns - escape key to prevent ReDoS
    result = result.replace(new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, 'g'), value || '')
  }
  // Remove any remaining unmatched variables
  result = result.replace(/\{\{[^}]+\}\}/g, '')
  return result
}

// =====================================================
// TEMPLATE ACTIONS
// =====================================================

export async function getEmailTemplates(options?: {
  type?: string
  active_only?: boolean
}): Promise<EmailTemplate[]> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('email_templates')
      .select('*')
      .order('template_type')
      .order('name')

    if (options?.type) {
      query = query.eq('template_type', options.type)
    }

    if (options?.active_only !== false) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Error fetching email templates', { error: error })
      return []
    }

    return data || []
  } catch (error) {
    logger.error('Error fetching email templates', { error: error })
    return []
  }
}

export async function getEmailTemplate(id: string): Promise<EmailTemplate | null> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'skabelon ID')

    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      logger.error('Error fetching email template', { error: error })
      return null
    }

    return data
  } catch (error) {
    logger.error('Error fetching email template', { error: error })
    return null
  }
}

export async function getEmailTemplateByCode(code: string): Promise<EmailTemplate | null> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      logger.error('Error fetching email template by code', { error: error })
      return null
    }

    return data
  } catch (error) {
    logger.error('Error fetching email template by code', { error: error })
    return null
  }
}

export async function createEmailTemplate(
  input: EmailTemplateCreate
): Promise<{ success: boolean; data?: EmailTemplate; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('email_templates')
      .insert({
        ...input,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      logger.error('Error creating email template', { error: error })
      return { success: false, error: 'Kunne ikke oprette skabelon' }
    }

    revalidatePath('/dashboard/settings/email')
    return { success: true, data }
  } catch (error) {
    logger.error('Error creating email template', { error: error })
    return { success: false, error: 'Uventet fejl' }
  }
}

export async function updateEmailTemplate(
  id: string,
  input: EmailTemplateUpdate
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'skabelon ID')

    const { error } = await supabase
      .from('email_templates')
      .update(input)
      .eq('id', id)

    if (error) {
      logger.error('Error updating email template', { error: error })
      return { success: false, error: 'Kunne ikke opdatere skabelon' }
    }

    revalidatePath('/dashboard/settings/email')
    return { success: true }
  } catch (error) {
    logger.error('Error updating email template', { error: error })
    return { success: false, error: 'Uventet fejl' }
  }
}

export async function deleteEmailTemplate(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'skabelon ID')

    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Error deleting email template', { error: error })
      return { success: false, error: 'Kunne ikke slette skabelon' }
    }

    revalidatePath('/dashboard/settings/email')
    return { success: true }
  } catch (error) {
    logger.error('Error deleting email template', { error: error })
    return { success: false, error: 'Uventet fejl' }
  }
}

// =====================================================
// THREAD ACTIONS
// =====================================================

export async function getEmailThreads(options?: {
  offer_id?: string
  customer_id?: string
  status?: string
  limit?: number
}): Promise<EmailThreadWithRelations[]> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('email_threads')
      .select(`
        *,
        offer:offers(id, offer_number, title, status, final_amount),
        customer:customers(id, company_name, contact_person, email),
        latest_message:email_messages(*)
      `)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (options?.offer_id) {
      query = query.eq('offer_id', options.offer_id)
    }

    if (options?.customer_id) {
      query = query.eq('customer_id', options.customer_id)
    }

    if (options?.status) {
      query = query.eq('status', options.status)
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Error fetching email threads', { error: error })
      return []
    }

    // Process to get only latest message
    return (data || []).map(thread => ({
      ...thread,
      latest_message: Array.isArray(thread.latest_message)
        ? thread.latest_message.sort((a: EmailMessage, b: EmailMessage) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0]
        : thread.latest_message,
    }))
  } catch (error) {
    logger.error('Error fetching email threads', { error: error })
    return []
  }
}

export async function getEmailThread(id: string): Promise<EmailThreadWithRelations | null> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'tråd ID')

    const { data, error } = await supabase
      .from('email_threads')
      .select(`
        *,
        offer:offers(id, offer_number, title, status, final_amount),
        customer:customers(id, company_name, contact_person, email),
        messages:email_messages(*)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      logger.error('Error fetching email thread', { error: error })
      return null
    }

    // Sort messages by date
    if (data.messages) {
      data.messages.sort((a: EmailMessage, b: EmailMessage) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    }

    return data
  } catch (error) {
    logger.error('Error fetching email thread', { error: error })
    return null
  }
}

export async function createEmailThread(
  input: EmailThreadCreate
): Promise<{ success: boolean; data?: EmailThread; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('email_threads')
      .insert({
        ...input,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      logger.error('Error creating email thread', { error: error })
      return { success: false, error: 'Kunne ikke oprette e-mail tråd' }
    }

    return { success: true, data }
  } catch (error) {
    logger.error('Error creating email thread', { error: error })
    return { success: false, error: 'Uventet fejl' }
  }
}

// =====================================================
// MESSAGE ACTIONS
// =====================================================

export async function getEmailMessages(threadId: string): Promise<EmailMessageWithRelations[]> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(threadId, 'tråd ID')

    const { data, error } = await supabase
      .from('email_messages')
      .select(`
        *,
        template:email_templates(id, code, name),
        events:email_events(*)
      `)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    if (error) {
      logger.error('Error fetching email messages', { error: error })
      return []
    }

    return data || []
  } catch (error) {
    logger.error('Error fetching email messages', { error: error })
    return []
  }
}

export async function createEmailMessage(
  input: EmailMessageCreate
): Promise<{ success: boolean; data?: EmailMessage; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const trackingId = generateTrackingId()

    const { data, error } = await supabase
      .from('email_messages')
      .insert({
        ...input,
        tracking_id: trackingId,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      logger.error('Error creating email message', { error: error })
      return { success: false, error: 'Kunne ikke oprette e-mail' }
    }

    return { success: true, data }
  } catch (error) {
    logger.error('Error creating email message', { error: error })
    return { success: false, error: 'Uventet fejl' }
  }
}

// =====================================================
// EVENT TRACKING
// =====================================================

export async function logEmailEvent(
  input: EmailEventCreate
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('email_events')
      .insert(input)

    if (error) {
      logger.error('Error logging email event', { error: error })
      return { success: false, error: 'Kunne ikke logge event' }
    }

    return { success: true }
  } catch (error) {
    logger.error('Error logging email event', { error: error })
    return { success: false, error: 'Uventet fejl' }
  }
}

export async function trackEmailOpen(trackingId: string, metadata?: {
  ip_address?: string
  user_agent?: string
}): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient()

    // Find message by tracking ID
    const { data: message, error: findError } = await supabase
      .from('email_messages')
      .select('id')
      .eq('tracking_id', trackingId)
      .maybeSingle()

    if (findError || !message) {
      return { success: false }
    }

    // Log the open event
    await supabase
      .from('email_events')
      .insert({
        message_id: message.id,
        event_type: 'opened',
        ip_address: metadata?.ip_address,
        user_agent: metadata?.user_agent,
      })

    return { success: true }
  } catch (error) {
    logger.error('Error tracking email open', { error: error })
    return { success: false }
  }
}

// =====================================================
// GENERATE EMAIL PREVIEW
// =====================================================

export async function generateEmailPreview(
  input: GenerateEmailPreviewInput
): Promise<{ success: boolean; data?: EmailPreview; error?: string }> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Get offer with customer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select(`
        *,
        customer:customers(*)
      `)
      .eq('id', input.offer_id)
      .maybeSingle()

    if (offerError || !offer) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    // Get template
    const templateCode = input.template_code || 'offer_send'
    const template = await getEmailTemplateByCode(templateCode)
    if (!template) {
      return { success: false, error: 'E-mail skabelon ikke fundet' }
    }

    // Get company settings
    const settingsResult = await getCompanySettings()
    const settings = settingsResult.success ? settingsResult.data : null

    // Get or create portal token
    let portalToken = ''
    const { data: existingToken } = await supabase
      .from('portal_access_tokens')
      .select('token')
      .eq('customer_id', offer.customer_id)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (existingToken) {
      portalToken = existingToken.token
    } else {
      const tokenResult = await createPortalToken({
        customer_id: offer.customer_id,
        email: offer.customer?.email || '',
      })
      if (tokenResult.success && tokenResult.data) {
        portalToken = tokenResult.data.token
      }
    }

    const appUrl = APP_URL
    const portalLink = `${appUrl}/portal/${portalToken}/offers/${offer.id}`
    const trackingPixel = `${appUrl}/api/email/track/pixel?t=${generateTrackingId()}`

    // Build variables
    const variables: Record<string, string> = {
      customer_name: offer.customer?.contact_person || offer.customer?.company_name || 'Kunde',
      offer_number: offer.offer_number || '',
      offer_title: offer.title || '',
      offer_description: offer.description || '',
      total_amount: formatCurrency(offer.final_amount || 0),
      valid_until: offer.valid_until ? formatDateLongDK(offer.valid_until) : '',
      portal_link: portalLink,
      company_name: settings?.company_name || 'Elta Solar',
      company_email: settings?.company_email || '',
      company_phone: settings?.company_phone || '',
      company_address: settings?.company_address || '',
      sender_name: settings?.company_name || 'Elta Solar',
      tracking_pixel: trackingPixel,
    }

    // Render template
    const subject = renderTemplate(template.subject_template, variables).replace(/[\r\n]/g, '')
    const bodyHtml = renderTemplate(template.body_html_template, variables)
    const bodyText = template.body_text_template
      ? renderTemplate(template.body_text_template, variables)
      : ''

    // Get Graph mailbox for from address
    const graphMailbox = isGraphConfigured() ? getMailbox() : ''

    return {
      success: true,
      data: {
        subject,
        body_html: bodyHtml,
        body_text: bodyText,
        from_email: graphMailbox || settings?.company_email || '',
        from_name: settings?.company_name || 'Elta Solar',
        to_email: offer.customer?.email || '',
        to_name: offer.customer?.contact_person || offer.customer?.company_name || '',
        variables,
      },
    }
  } catch (error) {
    logger.error('Error generating email preview', { error: error })
    return { success: false, error: 'Kunne ikke generere forhåndsvisning' }
  }
}

// =====================================================
// SEND OFFER EMAIL
// =====================================================

export async function sendOfferEmail(
  input: SendOfferEmailInput
): Promise<SendOfferEmailResult> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Resolve sender name: explicit > profile > fallback
    let senderName = input.sender_name
    if (!senderName) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle()
      senderName = profile?.full_name || undefined
    }

    // Get offer with customer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select(`
        *,
        customer:customers(*)
      `)
      .eq('id', input.offer_id)
      .maybeSingle()

    if (offerError || !offer) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    if (!offer.customer?.email) {
      return { success: false, error: 'Kunde har ingen e-mail adresse' }
    }

    // Generate preview (includes all variables and rendered content)
    const previewResult = await generateEmailPreview({
      offer_id: input.offer_id,
      template_code: input.template_code,
    })

    if (!previewResult.success || !previewResult.data) {
      return { success: false, error: previewResult.error || 'Kunne ikke generere e-mail' }
    }

    const preview = previewResult.data

    // Use override subject/body if provided
    const subject = input.subject || preview.subject
    const bodyHtml = input.body_html || preview.body_html
    const bodyText = input.body_text || preview.body_text

    // Check Microsoft Graph configuration
    if (!isGraphConfigured()) {
      return { success: false, error: 'Microsoft Graph er ikke konfigureret. Sæt AZURE_TENANT_ID, AZURE_CLIENT_ID og AZURE_CLIENT_SECRET.' }
    }
    const fromEmail = getMailbox()

    // Build attachments array (PDF + any extra)
    const emailAttachments: Array<{ filename: string; content: Buffer | string; contentType?: string }> = []

    // Generate and attach PDF if requested
    if (input.include_pdf) {
      try {
        const { renderToBuffer } = await import('@react-pdf/renderer')
        const { OfferPdfDocument } = await import('@/lib/pdf/offer-pdf-template')
        const settingsResult = await getCompanySettings()

        if (settingsResult.success && settingsResult.data) {
          // Fetch full offer with line items for PDF
          const { data: fullOffer } = await supabase
            .from('offers')
            .select(`*, line_items:offer_line_items(*), customer:customers(id, customer_number, company_name, contact_person, email, phone, billing_address, billing_city, billing_postal_code, billing_country)`)
            .eq('id', input.offer_id)
            .single()

          if (fullOffer) {
            if (fullOffer.line_items) {
              fullOffer.line_items.sort((a: { position: number }, b: { position: number }) => a.position - b.position)
            }
            const pdfDoc = OfferPdfDocument({
              offer: fullOffer as any,
              companySettings: settingsResult.data,
            }) as any
            const pdfBuffer = await renderToBuffer(pdfDoc)
            emailAttachments.push({
              filename: `${fullOffer.offer_number || 'tilbud'}.pdf`,
              content: Buffer.from(pdfBuffer),
              contentType: 'application/pdf',
            })
          }
        }
      } catch (pdfError) {
        logger.error('Failed to generate PDF attachment', { error: pdfError })
        // Continue without PDF — don't block the email
      }
    }

    // Create or get thread
    let thread: EmailThread | null = null
    const { data: existingThreads } = await supabase
      .from('email_threads')
      .select('*')
      .eq('offer_id', input.offer_id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingThreads && existingThreads.length > 0) {
      thread = existingThreads[0]
    } else {
      const threadResult = await createEmailThread({
        offer_id: input.offer_id,
        customer_id: offer.customer_id,
        subject: subject,
        status: 'draft',
      })
      if (!threadResult.success || !threadResult.data) {
        return { success: false, error: 'Kunne ikke oprette e-mail tråd' }
      }
      thread = threadResult.data
    }

    // Verify we have a thread
    if (!thread) {
      return { success: false, error: 'Kunne ikke finde eller oprette e-mail tråd' }
    }

    // Create message record
    const trackingId = generateTrackingId()
    const appUrl = APP_URL
    const trackingPixel = `${appUrl}/api/email/track/${trackingId}`

    // Inject tracking pixel into HTML
    const finalHtml = bodyHtml.includes('tracking_pixel')
      ? bodyHtml.replace(/\{\{tracking_pixel\}\}/g, trackingPixel)
      : bodyHtml + `<img src="${trackingPixel}" width="1" height="1" style="display:none" alt="">`

    const messageResult = await createEmailMessage({
      thread_id: thread.id,
      direction: 'outbound',
      from_email: fromEmail,
      from_name: senderName ? `${senderName} | Elta Solar` : 'Elta Solar',
      to_email: offer.customer.email,
      to_name: offer.customer.contact_person || offer.customer.company_name || undefined,
      subject,
      body_html: finalHtml,
      body_text: bodyText,
      template_id: undefined, // Could be added if we pass template ID
      template_variables: preview.variables,
      cc: input.cc,
      bcc: input.bcc,
      status: 'queued',
    })

    if (!messageResult.success || !messageResult.data) {
      return { success: false, error: 'Kunne ikke oprette e-mail besked' }
    }

    const message = messageResult.data

    // Update tracking ID
    await supabase
      .from('email_messages')
      .update({ tracking_id: trackingId })
      .eq('id', message.id)

    // Actually send the email via Microsoft Graph
    const emailResult = await sendEmailViaGraph({
      to: offer.customer.email,
      subject,
      html: finalHtml,
      senderName,
      replyTo: fromEmail,
      attachments: emailAttachments.map(att => ({
        filename: att.filename,
        content: att.content instanceof Buffer ? att.content : Buffer.from(att.content as string),
        contentType: att.contentType || 'application/octet-stream',
      })),
    })

    if (!emailResult.success) {
      // Update message status to failed
      await supabase
        .from('email_messages')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_message: emailResult.error,
        })
        .eq('id', message.id)

      return { success: false, error: emailResult.error || 'Kunne ikke sende e-mail' }
    }

    // Update message status to sent
    await supabase
      .from('email_messages')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        message_id: emailResult.messageId,
      })
      .eq('id', message.id)

    // Update offer status if it was draft
    if (offer.status === 'draft') {
      await supabase
        .from('offers')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', offer.id)
    }

    // Log activity
    await logOfferActivity(offer.id, 'email_sent', `E-mail sendt til ${offer.customer.email}`, null, {
      message_id: message.id,
      tracking_id: trackingId,
      subject,
    })

    // Auto-opret opfølgningsopgave (3 dages påmindelse)
    try {
      const reminderDate = new Date()
      reminderDate.setDate(reminderDate.getDate() + 3)

      await supabase.from('customer_tasks').insert({
        customer_id: offer.customer_id,
        offer_id: offer.id,
        title: `Følg op: ${offer.title || offer.offer_number} — intet svar modtaget`,
        description: `Automatisk opfølgning oprettet ved afsendelse af tilbud til ${offer.customer.email}.`,
        priority: 'normal',
        assigned_to: userId,
        reminder_at: reminderDate.toISOString(),
        created_by: userId,
      })
    } catch (taskErr) {
      logger.warn('Failed to create follow-up task', { error: taskErr })
    }

    revalidatePath(`/dashboard/offers/${offer.id}`)

    return {
      success: true,
      thread_id: thread.id,
      message_id: message.id,
      tracking_id: trackingId,
    }
  } catch (error) {
    logger.error('Error sending offer email', { error: error })
    return { success: false, error: 'Uventet fejl ved afsendelse af e-mail' }
  }
}

// =====================================================
// RESEND EMAIL
// =====================================================

export async function resendEmail(
  messageId: string,
  updates?: { subject?: string; body_html?: string }
): Promise<SendOfferEmailResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(messageId, 'besked ID')

    // Get original message with thread
    const { data: message, error: msgError } = await supabase
      .from('email_messages')
      .select(`
        *,
        thread:email_threads(*)
      `)
      .eq('id', messageId)
      .maybeSingle()

    if (msgError || !message) {
      return { success: false, error: 'Besked ikke fundet' }
    }

    if (!message.thread?.offer_id) {
      return { success: false, error: 'Ingen tilbud tilknyttet denne tråd' }
    }

    // Resend with original data + updates
    return sendOfferEmail({
      offer_id: message.thread.offer_id,
      subject: updates?.subject || message.subject,
      body_html: updates?.body_html || message.body_html,
      body_text: message.body_text || undefined,
      cc: message.cc || undefined,
      bcc: message.bcc || undefined,
    })
  } catch (error) {
    logger.error('Error resending email', { error: error })
    return { success: false, error: 'Uventet fejl' }
  }
}

// =====================================================
// INBOUND EMAIL (WEBHOOK STUB)
// =====================================================

export async function logIncomingEmail(
  data: {
    from_email: string
    from_name?: string
    to_email: string
    subject: string
    body_text?: string
    body_html?: string
    raw_email?: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Try to find matching thread by subject (contains offer number)
    const offerNumberMatch = data.subject.match(/TILBUD-\d{4}-\d{4}/i)
    let threadId: string | null = null

    if (offerNumberMatch) {
      const { data: offer } = await supabase
        .from('offers')
        .select('id')
        .eq('offer_number', offerNumberMatch[0])
        .maybeSingle()

      if (offer) {
        const { data: threads } = await supabase
          .from('email_threads')
          .select('id')
          .eq('offer_id', offer.id)
          .order('created_at', { ascending: false })
          .limit(1)

        if (threads && threads.length > 0) {
          threadId = threads[0].id
        }
      }
    }

    // Parse intent from body
    let parsedIntent: 'accept' | 'reject' | 'question' | 'unknown' = 'unknown'
    const bodyLower = (data.body_text || data.body_html || '').toLowerCase()

    if (bodyLower.includes('accepter') || bodyLower.includes('ja tak') || bodyLower.includes('godkend')) {
      parsedIntent = 'accept'
    } else if (bodyLower.includes('afvis') || bodyLower.includes('nej tak') || bodyLower.includes('annuller')) {
      parsedIntent = 'reject'
    } else if (bodyLower.includes('spørgsmål') || bodyLower.includes('?')) {
      parsedIntent = 'question'
    }

    // Create thread if not found
    if (!threadId) {
      const { data: newThread, error: threadError } = await supabase
        .from('email_threads')
        .insert({
          subject: data.subject,
          status: 'replied',
        })
        .select('id')
        .single()

      if (threadError) {
        return { success: false, error: 'Kunne ikke oprette tråd' }
      }
      threadId = newThread.id
    }

    // Create inbound message
    const { error: msgError } = await supabase
      .from('email_messages')
      .insert({
        thread_id: threadId,
        direction: 'inbound',
        from_email: data.from_email,
        from_name: data.from_name,
        to_email: data.to_email,
        subject: data.subject,
        body_text: data.body_text,
        body_html: data.body_html,
        raw_email: data.raw_email,
        parsed_intent: parsedIntent,
        status: 'delivered',
        delivered_at: new Date().toISOString(),
      })

    if (msgError) {
      return { success: false, error: 'Kunne ikke gemme besked' }
    }

    // Update thread status
    const { data: currentThread } = await supabase
      .from('email_threads')
      .select('unread_count')
      .eq('id', threadId)
      .maybeSingle()

    await supabase
      .from('email_threads')
      .update({
        status: 'replied',
        last_replied_at: new Date().toISOString(),
        unread_count: (currentThread?.unread_count || 0) + 1,
      })
      .eq('id', threadId)

    return { success: true }
  } catch (error) {
    logger.error('Error logging incoming email', { error: error })
    return { success: false, error: 'Uventet fejl' }
  }
}

// =====================================================
// EMAIL STATISTICS
// =====================================================

export async function getEmailStats(options?: {
  offer_id?: string
  customer_id?: string
  days?: number
}): Promise<{
  total_sent: number
  total_opened: number
  total_clicked: number
  total_bounced: number
  open_rate: number
  click_rate: number
}> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('email_messages')
      .select('status, opened_at, clicked_at')
      .eq('direction', 'outbound')
      .neq('status', 'draft')

    if (options?.offer_id) {
      // Get threads for this offer first
      const { data: threads } = await supabase
        .from('email_threads')
        .select('id')
        .eq('offer_id', options.offer_id)

      if (threads && threads.length > 0) {
        query = query.in('thread_id', threads.map(t => t.id))
      }
    }

    if (options?.days) {
      const since = new Date()
      since.setDate(since.getDate() - options.days)
      query = query.gte('created_at', since.toISOString())
    }

    const { data: messages } = await query

    if (!messages || messages.length === 0) {
      return {
        total_sent: 0,
        total_opened: 0,
        total_clicked: 0,
        total_bounced: 0,
        open_rate: 0,
        click_rate: 0,
      }
    }

    const totalSent = messages.filter(m => ['sent', 'delivered', 'opened', 'clicked'].includes(m.status)).length
    const totalOpened = messages.filter(m => m.opened_at).length
    const totalClicked = messages.filter(m => m.clicked_at).length
    const totalBounced = messages.filter(m => m.status === 'bounced').length

    return {
      total_sent: totalSent,
      total_opened: totalOpened,
      total_clicked: totalClicked,
      total_bounced: totalBounced,
      open_rate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0,
      click_rate: totalSent > 0 ? (totalClicked / totalSent) * 100 : 0,
    }
  } catch (error) {
    logger.error('Error getting email stats', { error: error })
    return {
      total_sent: 0,
      total_opened: 0,
      total_clicked: 0,
      total_bounced: 0,
      open_rate: 0,
      click_rate: 0,
    }
  }
}

// =====================================================
// EMAIL TESTING ACTIONS (via Graph API)
// =====================================================

/**
 * Test Graph API connection
 */
export async function testEmailConnectionAction(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isGraphConfigured()) {
      return { success: false, error: 'Microsoft Graph er ikke konfigureret. Sæt AZURE_TENANT_ID, AZURE_CLIENT_ID og AZURE_CLIENT_SECRET.' }
    }
    return { success: true }
  } catch (error) {
    logger.error('Error testing Graph connection', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Uventet fejl',
    }
  }
}

/**
 * Send test email via Graph API
 */
export async function sendTestEmailAction(
  toEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isGraphConfigured()) {
      return { success: false, error: 'Microsoft Graph er ikke konfigureret.' }
    }

    const result = await sendEmailViaGraph({
      to: toEmail,
      subject: 'Test e-mail fra Elta CRM',
      html: `
        <h1>Test e-mail</h1>
        <p>Dette er en test e-mail fra Elta CRM.</p>
        <p>Hvis du modtager denne e-mail, er Microsoft Graph konfigurationen korrekt.</p>
        <p>Sendt: ${new Date().toLocaleString('da-DK')}</p>
      `,
    })

    return {
      success: result.success,
      error: result.error,
    }
  } catch (error) {
    logger.error('Error sending test email', { error: error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Uventet fejl',
    }
  }
}
