'use server'

/**
 * Server Actions — Customer Mailbox (Smart Indbakke pr. kunde)
 *
 * Hard-filtered: Only shows emails directly to/from the customer's email address.
 * Tracks both incoming (received) and outgoing (sent) emails.
 */

import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Record outgoing email in incoming_emails table
// =====================================================

/**
 * Record an outgoing (sent) email in the incoming_emails table so it appears
 * in the customer timeline alongside received emails. This gives a complete
 * bidirectional view of all correspondence.
 */
async function recordOutgoingEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  data: {
    to_email: string
    subject: string
    body_html: string
    sender_email: string
    sender_name: string
    graph_message_id?: string | null
    conversation_id?: string | null
    customer_id?: string | null
  }
): Promise<void> {
  try {
    // Dedup: don't insert if we already have this graph_message_id
    if (data.graph_message_id) {
      const { data: existing } = await supabase
        .from('incoming_emails')
        .select('id')
        .eq('graph_message_id', data.graph_message_id)
        .maybeSingle()
      if (existing) return
    }

    // Find the customer by email if not provided
    let customerId = data.customer_id
    if (!customerId) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .ilike('email', data.to_email.toLowerCase())
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      customerId = customer?.id || null
    }

    const { error } = await supabase
      .from('incoming_emails')
      .insert({
        graph_message_id: data.graph_message_id || `sent-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        conversation_id: data.conversation_id || null,
        subject: data.subject,
        sender_email: data.sender_email,
        sender_name: data.sender_name,
        to_email: data.to_email.toLowerCase(),
        cc: [],
        body_html: data.body_html,
        body_preview: data.subject.substring(0, 200),
        has_attachments: false,
        is_read: true,
        received_at: new Date().toISOString(),
        link_status: customerId ? 'linked' : 'unidentified',
        customer_id: customerId,
        linked_by: customerId ? 'auto' : null,
        linked_at: customerId ? new Date().toISOString() : null,
        processed_at: new Date().toISOString(),
      })

    if (error) {
      logger.error('Failed to record outgoing email', { error, metadata: { to: data.to_email } })
    }
  } catch (err) {
    // Non-critical: don't break the send flow
    logger.warn('Failed to record outgoing email in incoming_emails', { error: err })
  }
}

export interface CustomerMailboxEmail {
  id: string
  subject: string | null
  sender_email: string
  sender_name: string | null
  to_email: string | null
  body_html: string | null
  body_text: string | null
  body_preview: string | null
  has_attachments: boolean
  is_read: boolean
  received_at: string
  direction: 'incoming' | 'outgoing'
  reply_to: string | null
  conversation_id?: string | null
}

export interface CustomerConversation {
  conversationId: string
  subject: string
  messages: CustomerMailboxEmail[]
  messageCount: number
  latestAt: string
  hasUnread: boolean
}

/**
 * Get emails for a specific customer, hard-filtered by their email address.
 * Shows ONLY emails where sender_email matches OR to_email matches the customer.
 * Also includes emails linked via customer_id (for manual links).
 * Groups by conversationId for threading.
 */
export async function getCustomerMailbox(
  customerId: string,
  customerEmail: string
): Promise<{ emails: CustomerMailboxEmail[]; unreadCount: number; conversations: CustomerConversation[] }> {
  const supabase = await createClient()

  const emailLower = customerEmail.toLowerCase()

  // Fetch all non-archived emails involving this customer:
  // 1. By email address match (sender, original sender, or to)
  // 2. By customer_id link (for manually linked emails)
  const { data, error } = await supabase
    .from('incoming_emails')
    .select('id, subject, sender_email, sender_name, to_email, body_html, body_text, body_preview, has_attachments, is_read, received_at, reply_to, original_sender_email, conversation_id, customer_id')
    .eq('is_archived', false)
    .or(`sender_email.ilike.${emailLower},original_sender_email.ilike.${emailLower},to_email.ilike.${emailLower},customer_id.eq.${customerId}`)
    .order('received_at', { ascending: false })
    .limit(200)

  if (error) {
    logger.error('Failed to fetch customer mailbox', { error, entityId: customerId })
    return { emails: [], unreadCount: 0, conversations: [] }
  }

  const emails: CustomerMailboxEmail[] = (data || []).map((e) => {
    // Determine direction: if sender_email matches customer → incoming from customer
    // If to_email matches customer → outgoing to customer
    const senderMatch = e.sender_email?.toLowerCase() === emailLower ||
      e.original_sender_email?.toLowerCase() === emailLower
    const direction: 'incoming' | 'outgoing' = senderMatch ? 'incoming' : 'outgoing'

    return {
      id: e.id,
      subject: e.subject,
      sender_email: e.sender_email,
      sender_name: e.sender_name,
      to_email: e.to_email,
      body_html: e.body_html,
      body_text: e.body_text,
      body_preview: e.body_preview,
      has_attachments: e.has_attachments,
      is_read: e.is_read,
      received_at: e.received_at,
      direction,
      reply_to: e.reply_to,
      conversation_id: (e as Record<string, unknown>).conversation_id as string | null,
    }
  })

  // Group emails by conversationId for threading
  const conversationMap = new Map<string, CustomerMailboxEmail[]>()
  const noConversation: CustomerMailboxEmail[] = []

  for (const email of emails) {
    if (email.conversation_id) {
      const group = conversationMap.get(email.conversation_id) || []
      group.push(email)
      conversationMap.set(email.conversation_id, group)
    } else {
      noConversation.push(email)
    }
  }

  // Build conversations sorted by most recent message
  const conversations: CustomerConversation[] = []

  for (const [conversationId, msgs] of conversationMap) {
    // Sort messages within conversation chronologically (oldest first)
    msgs.sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime())
    const latestMsg = msgs[msgs.length - 1]
    conversations.push({
      conversationId,
      subject: latestMsg.subject || msgs[0].subject || '(Intet emne)',
      messages: msgs,
      messageCount: msgs.length,
      latestAt: latestMsg.received_at,
      hasUnread: msgs.some(m => !m.is_read && m.direction === 'incoming'),
    })
  }

  // Add standalone emails as single-message conversations
  for (const email of noConversation) {
    conversations.push({
      conversationId: email.id, // Use email ID as key
      subject: email.subject || '(Intet emne)',
      messages: [email],
      messageCount: 1,
      latestAt: email.received_at,
      hasUnread: !email.is_read && email.direction === 'incoming',
    })
  }

  // Sort conversations by most recent first
  conversations.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())

  const unreadCount = emails.filter((e) => !e.is_read && e.direction === 'incoming').length

  return { emails, unreadCount, conversations }
}

/**
 * Get the full email body (HTML) for viewing
 */
export async function getCustomerEmailBody(emailId: string): Promise<{
  html: string | null
  text: string | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('incoming_emails')
    .select('body_html, body_text')
    .eq('id', emailId)
    .maybeSingle()

  if (error || !data) {
    return { html: null, text: null }
  }

  return { html: data.body_html, text: data.body_text }
}

/**
 * Mark a customer email as read
 */
export async function markCustomerEmailRead(emailId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('incoming_emails')
    .update({ is_read: true })
    .eq('id', emailId)
}

/**
 * Send a new email to a customer (compose from scratch)
 */
export async function sendEmailToCustomer(
  customerEmail: string,
  subject: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await getAuthenticatedClient()

    // Get sender profile
    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()
    const senderName = (profile as { full_name: string } | null)?.full_name || undefined

    const { BRAND_COMPANY_NAME, BRAND_EMAIL, BRAND_WEBSITE, BRAND_GREEN } = await import('@/lib/brand')

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <div style="background: ${BRAND_GREEN}; padding: 20px 28px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 18px;">${BRAND_COMPANY_NAME}</h1>
        </div>
        <div style="padding: 28px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <div style="font-size: 15px; color: #111827; line-height: 1.6; white-space: pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #374151; margin: 0;">
            Med venlig hilsen,<br/>
            <strong>${senderName || BRAND_COMPANY_NAME}</strong><br/>
            <span style="color: #6b7280; font-size: 13px;">${BRAND_EMAIL} &bull; ${BRAND_WEBSITE}</span>
          </p>
        </div>
      </div>
    `

    const { sendEmailViaGraph, getMailbox } = await import('@/lib/services/microsoft-graph')
    const result = await sendEmailViaGraph({
      to: customerEmail,
      subject,
      html,
      senderName,
    })

    if (result.success) {
      // Record outgoing email in incoming_emails for customer timeline
      await recordOutgoingEmail(supabase, {
        to_email: customerEmail,
        subject,
        body_html: html,
        sender_email: getMailbox(),
        sender_name: senderName || BRAND_COMPANY_NAME,
        graph_message_id: result.messageId || null,
      })

      logger.info('Email sent to customer', {
        entity: 'customer_mailbox',
        metadata: { to: customerEmail, subject, userId },
      })
    }

    return result
  } catch (err) {
    logger.error('sendEmailToCustomer failed', { error: err })
    return { success: false, error: err instanceof Error ? err.message : 'Ukendt fejl' }
  }
}

/**
 * Reply to a customer email
 */
export async function replyToCustomerEmail(
  emailId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await getAuthenticatedClient()
    const supabase = await createClient()

    // Fetch original email
    const { data: email } = await supabase
      .from('incoming_emails')
      .select('subject, sender_email, sender_name, reply_to, body_text, body_preview, received_at')
      .eq('id', emailId)
      .maybeSingle()

    if (!email) return { success: false, error: 'Email ikke fundet' }

    const replyTo = email.reply_to || email.sender_email
    if (!replyTo) return { success: false, error: 'Ingen modtager-adresse' }

    // Get sender profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()
    const senderName = (profile as { full_name: string } | null)?.full_name || undefined

    const subject = email.subject?.startsWith('Re:')
      ? email.subject
      : `Re: ${email.subject || '(Intet emne)'}`

    const { sendEmailViaGraph, getMailbox } = await import('@/lib/services/microsoft-graph')
    const { generateCrmReplyHtml } = await import('@/lib/email/templates/crm-reply-email')

    const originalBody = (email.body_text || email.body_preview || '')
      .replace(/\n/g, '<br />')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

    const dateStr = new Date(email.received_at).toLocaleDateString('da-DK', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

    const html = generateCrmReplyHtml({
      messageBody: message,
      senderName: senderName || 'Elta Solar',
      senderEmail: getMailbox(),
      originalDate: dateStr,
      originalSender: email.sender_name || email.sender_email,
      originalBody,
    })
    const result = await sendEmailViaGraph({
      to: replyTo,
      subject,
      html,
      senderName,
    })

    if (result.success) {
      // Record outgoing email in incoming_emails for customer timeline
      // Fetch the conversation_id from the original email for threading
      const { data: origEmail } = await supabase
        .from('incoming_emails')
        .select('conversation_id, customer_id')
        .eq('id', emailId)
        .maybeSingle()

      await recordOutgoingEmail(supabase, {
        to_email: replyTo,
        subject,
        body_html: html,
        sender_email: getMailbox(),
        sender_name: senderName || 'Elta Solar',
        graph_message_id: result.messageId || null,
        conversation_id: origEmail?.conversation_id || null,
        customer_id: origEmail?.customer_id || null,
      })

      logger.info('Reply sent to customer', {
        entity: 'customer_mailbox',
        entityId: emailId,
        metadata: { to: replyTo, subject, userId },
      })
    }

    return result
  } catch (err) {
    logger.error('replyToCustomerEmail failed', { error: err })
    return { success: false, error: err instanceof Error ? err.message : 'Ukendt fejl' }
  }
}

/**
 * Get unread customer email count for dashboard
 */
export async function getUnreadCustomerEmailCount(): Promise<number> {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('incoming_emails')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
    .eq('is_archived', false)
    .eq('link_status', 'linked')
    .not('customer_id', 'is', null)

  if (error) return 0
  return count || 0
}
