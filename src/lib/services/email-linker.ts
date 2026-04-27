/**
 * Email Linker Service
 *
 * Scans incoming emails and links them to customers:
 * 1. Extract original sender from forwarded emails (regex)
 * 2. Match sender against customers table (email, domain, name)
 * 3. Match against customer_contacts table
 * 4. Mark as 'linked' or 'unidentified'
 */

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import type { LinkResult, EmailLinkStatus } from '@/types/mail-bridge.types'

// =====================================================
// Original Sender Extraction (forwarded emails)
// =====================================================

/**
 * Regex patterns for extracting original sender from forwarded emails.
 * Covers Outlook, Gmail, Apple Mail — both Danish and English.
 */
const FORWARDED_PATTERNS = [
  // Outlook Danish: "Fra: Jens Jensen <jens@firma.dk>"
  /Fra:\s*(.+?)\s*<([^>]+@[^>]+)>/i,
  // Outlook English: "From: John Smith <john@company.com>"
  /From:\s*(.+?)\s*<([^>]+@[^>]+)>/i,
  // Gmail-style: "---------- Forwarded message ----------\nFrom: name <email>"
  /Forwarded message.*?From:\s*(.+?)\s*<([^>]+@[^>]+)>/is,
  // Videresendt besked (Danish): "---------- Videresendt besked ----------"
  /Videresendt besked.*?Fra:\s*(.+?)\s*<([^>]+@[^>]+)>/is,
  // Simple "Fra: email@example.com" (no angle brackets)
  /Fra:\s*([^<\n]+@[^>\s\n]+)/i,
  // Simple "From: email@example.com"
  /From:\s*([^<\n]+@[^>\s\n]+)/i,
  // Outlook header block: "Afsender: name <email>"
  /Afsender:\s*(.+?)\s*<([^>]+@[^>]+)>/i,
]

/**
 * Subject patterns indicating a forwarded email
 */
const FORWARDED_SUBJECT_PATTERNS = [
  /^(VS|Fwd|Fw|VB):\s*/i, // VS: (Danish), Fwd:, Fw:, VB: (Videresendt Besked)
]

export interface ExtractedSender {
  email: string
  name: string | null
  isForwarded: boolean
}

/**
 * Extract the original sender from forwarded email body/subject.
 * Returns the original sender if found, or the direct sender if not forwarded.
 */
export function extractOriginalSender(
  senderEmail: string,
  senderName: string | null,
  subject: string,
  bodyHtml: string | null,
  bodyText: string | null
): ExtractedSender {
  // Check subject for forwarding indicators
  const isForwardedSubject = FORWARDED_SUBJECT_PATTERNS.some((p) => p.test(subject))

  // Search through body for original sender
  const searchText = bodyText || stripHtml(bodyHtml || '')

  for (const pattern of FORWARDED_PATTERNS) {
    const match = searchText.match(pattern)
    if (match) {
      // Pattern with name + email in angle brackets
      if (match[2]) {
        return {
          email: match[2].trim().toLowerCase(),
          name: match[1].trim().replace(/^["']|["']$/g, '') || null,
          isForwarded: true,
        }
      }
      // Pattern with just email
      if (match[1] && match[1].includes('@')) {
        return {
          email: match[1].trim().toLowerCase(),
          name: null,
          isForwarded: true,
        }
      }
    }
  }

  // Not a forwarded email (or couldn't extract sender)
  return {
    email: senderEmail.toLowerCase(),
    name: senderName,
    isForwarded: isForwardedSubject,
  }
}

/**
 * Strip HTML tags for plain-text search
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// =====================================================
// Customer Matching
// =====================================================

/**
 * Try to match an email address against customers and customer_contacts.
 * Returns customer ID and match confidence.
 *
 * Matching priority:
 * 1. Exact email match on customers.email         → high confidence
 * 2. Exact email match on customer_contacts.email  → high confidence
 * 3. Domain match (same company domain)            → medium confidence
 */
export async function matchCustomer(
  email: string,
  name: string | null
): Promise<{
  customerId: string | null
  customerContactId: string | null
  matchedOn: 'email' | 'domain' | 'name' | null
  confidence: 'high' | 'medium' | 'low'
}> {
  const supabase = await createClient()
  const emailLower = email.toLowerCase()

  // 1. Direct match on customers.email
  const { data: customerMatch } = await supabase
    .from('customers')
    .select('id')
    .ilike('email', emailLower)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (customerMatch) {
    return {
      customerId: customerMatch.id,
      customerContactId: null,
      matchedOn: 'email',
      confidence: 'high',
    }
  }

  // 2. Match on customer_contacts.email
  const { data: contactMatch } = await supabase
    .from('customer_contacts')
    .select('id, customer_id')
    .ilike('email', emailLower)
    .limit(1)
    .maybeSingle()

  if (contactMatch) {
    return {
      customerId: contactMatch.customer_id,
      customerContactId: contactMatch.id,
      matchedOn: 'email',
      confidence: 'high',
    }
  }

  // 3. Domain match — extract domain and match against customer emails
  const domain = emailLower.split('@')[1]
  if (domain && !isFreemailDomain(domain)) {
    const { data: domainMatches } = await supabase
      .from('customers')
      .select('id')
      .ilike('email', `%@${domain}`)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (domainMatches) {
      return {
        customerId: domainMatches.id,
        customerContactId: null,
        matchedOn: 'domain',
        confidence: 'medium',
      }
    }
  }

  // No match found
  return {
    customerId: null,
    customerContactId: null,
    matchedOn: null,
    confidence: 'low',
  }
}

/**
 * Freemail domains that should NOT be used for domain matching
 * (many different customers can share gmail.com etc.)
 */
const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.dk',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'mail.dk', 'jubii.dk', 'ofir.dk', 'stofanet.dk', 'tdcadsl.dk',
  'email.dk', 'webspeed.dk', 'telenet.dk',
])

function isFreemailDomain(domain: string): boolean {
  return FREEMAIL_DOMAINS.has(domain.toLowerCase())
}

// =====================================================
// Process a single email
// =====================================================

/**
 * Run the full linker pipeline on one incoming email row.
 *
 * Matching priority:
 * 1. conversation_id → find existing linked email in same thread
 * 2. in_reply_to → find the original sent email by internet_message_id
 * 3. sender email/domain → matchCustomer()
 */
export async function linkEmail(
  emailId: string,
  senderEmail: string,
  senderName: string | null,
  subject: string,
  bodyHtml: string | null,
  bodyText: string | null
): Promise<LinkResult> {
  const supabase = await createClient()

  // 0. Thread-based matching: check conversation_id and in_reply_to first
  const { data: thisEmail } = await supabase
    .from('incoming_emails')
    .select('conversation_id, in_reply_to')
    .eq('id', emailId)
    .maybeSingle()

  let threadCustomerId: string | null = null

  // 0a. Match by conversation_id — find another email in same conversation that is already linked
  if (thisEmail?.conversation_id) {
    const { data: threadMatch } = await supabase
      .from('incoming_emails')
      .select('customer_id')
      .eq('conversation_id', thisEmail.conversation_id)
      .eq('link_status', 'linked')
      .not('customer_id', 'is', null)
      .neq('id', emailId)
      .limit(1)
      .maybeSingle()

    if (threadMatch?.customer_id) {
      threadCustomerId = threadMatch.customer_id
    }
  }

  // 0b. Match by in_reply_to → find the original email by its internet_message_id
  if (!threadCustomerId && thisEmail?.in_reply_to) {
    const { data: replyMatch } = await supabase
      .from('incoming_emails')
      .select('customer_id')
      .eq('internet_message_id', thisEmail.in_reply_to)
      .not('customer_id', 'is', null)
      .limit(1)
      .maybeSingle()

    if (replyMatch?.customer_id) {
      threadCustomerId = replyMatch.customer_id
    }
  }

  // 1. Extract original sender (handles forwarded emails)
  const extracted = extractOriginalSender(
    senderEmail,
    senderName,
    subject,
    bodyHtml,
    bodyText
  )

  // 2. Match against customers (email/domain/name)
  const match = await matchCustomer(extracted.email, extracted.name)

  // Use thread match if direct match failed
  if (!match.customerId && threadCustomerId) {
    match.customerId = threadCustomerId
    match.matchedOn = 'email' // Report as high-confidence since it's from the same thread
    match.confidence = 'high'
  }

  // 3. Determine status
  const status: EmailLinkStatus = match.customerId ? 'linked' : 'unidentified'

  const updateData: Record<string, unknown> = {
    link_status: status,
    customer_id: match.customerId,
    customer_contact_id: match.customerContactId,
    linked_by: match.customerId ? 'auto' : null,
    linked_at: match.customerId ? new Date().toISOString() : null,
    original_sender_email: extracted.isForwarded ? extracted.email : null,
    original_sender_name: extracted.isForwarded ? extracted.name : null,
    is_forwarded: extracted.isForwarded,
    processed_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('incoming_emails')
    .update(updateData)
    .eq('id', emailId)

  if (error) {
    logger.error('Failed to update email link status', {
      entity: 'incoming_emails',
      entityId: emailId,
      error,
    })
  }

  logger.info('Email linked', {
    entity: 'incoming_emails',
    entityId: emailId,
    metadata: {
      status,
      matchedOn: match.matchedOn,
      confidence: match.confidence,
      isForwarded: extracted.isForwarded,
      originalSender: extracted.email,
    },
  })

  return {
    emailId,
    status,
    customerId: match.customerId,
    customerContactId: match.customerContactId,
    matchedOn: match.matchedOn,
    confidence: match.confidence,
  }
}

// =====================================================
// Manual linking
// =====================================================

/**
 * Manually link an email to a customer (from UI).
 */
export async function manuallyLinkEmail(
  emailId: string,
  customerId: string
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('incoming_emails')
    .update({
      link_status: 'linked' as EmailLinkStatus,
      customer_id: customerId,
      linked_by: 'manual',
      linked_at: new Date().toISOString(),
    })
    .eq('id', emailId)

  if (error) {
    throw new Error(`Kunne ikke linke email: ${error.message}`)
  }

  logger.action('manual_link_email', undefined, 'incoming_emails', emailId, {
    customerId,
  })
}

/**
 * Remove customer link from email — resets to unidentified.
 */
export async function unlinkEmail(emailId: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('incoming_emails')
    .update({
      link_status: 'unidentified' as EmailLinkStatus,
      customer_id: null,
      linked_by: null,
      linked_at: null,
    })
    .eq('id', emailId)

  if (error) {
    throw new Error(`Kunne ikke fjerne kobling: ${error.message}`)
  }

  logger.action('unlink_email', undefined, 'incoming_emails', emailId, {})
}

/**
 * Mark email as ignored (not relevant).
 */
export async function ignoreEmail(emailId: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('incoming_emails')
    .update({ link_status: 'ignored' as EmailLinkStatus })
    .eq('id', emailId)

  if (error) {
    throw new Error(`Kunne ikke ignorere email: ${error.message}`)
  }
}
