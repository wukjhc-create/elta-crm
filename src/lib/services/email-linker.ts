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
// Sprint 8C-3 Noise filter
// Auto-markér nyhedsbreve/sociale-medier/system-mails som 'ignored'
// så de ikke fylder i inbox-tabben. De kan stadig findes via
// "Ignorerede"-filteret. INGEN sletning. INGEN permanent skjul.
// =====================================================

/** Domæner der typisk sender støj (sociale medier, system, marketing). */
const NOISE_SENDER_DOMAINS = new Set([
  // Sociale medier
  'linkedin.com', 'linkedinmail.com', 'e.linkedin.com',
  'facebookmail.com', 'facebook.com', 'instagram.com', 'meta.com',
  'twitter.com', 'x.com',
  // Google system
  'accounts.google.com', 'googlealerts-noreply.google.com',
  'googlecommunityteam-noreply.google.com',
  // Microsoft system
  'microsoftonline.com', 'account.microsoft.com',
  'accountprotection.microsoft.com',
  // Dev/SaaS notifications der ikke er kunderelevante
  'vercel.com', 'supabase.com', 'supabase.io', 'github.com',
  'notifications.github.com',
  // Job-portaler (ofte job-alerts, ikke kunde-relevante)
  'jobindex.dk', 'mail.jobindex.dk',
  'stepstone.dk', 'mail.stepstone.dk',
  'jobnet.dk',
  'indeed.com', 'indeed.dk', 'mail.indeed.com',
  'monster.dk', 'monster.com',
  // Email-marketing platforms (transaktionelle mails kan stadig komme
  // gennem disse, men typisk kampagner — beskyttelses-kæden fanger
  // forretningsmails via subject-keyword)
  'mailchimp.com', 'mailchimpapp.com', 'sendinblue.com', 'mailerlite.com',
])

/** Sender-prefix der typisk er notifikationer (skal kombineres med
 *  noise-subject for at blive markeret som støj). */
const NOISE_SENDER_PREFIXES = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'mailer-daemon', 'newsletter', 'marketing',
]

/** Subject/body-mønstre der indikerer støj. */
const NOISE_SUBJECT_KEYWORDS = [
  'unsubscribe', 'afmeld nyhedsbrev', 'afmeld dig',
  'newsletter', 'nyhedsbrev', 'tilbudsavis',
  'kampagne', 'promotion', 'special offer',
  'login code', 'verification code', 'verifikationskode',
  'security alert', 'sikkerhedsadvarsel',
  'terms of service', 'privacy policy update', 'opdatering af vilkår',
  'din rapport er klar', 'weekly digest', 'daily digest',
  // Job-relaterede alerts
  'job alert', 'jobalert', 'jobannonce', 'din ansoegning', 'din ansøgning',
  'job for dig', 'matchende jobs', 'nye jobs',
  // LinkedIn / sociale notifikationer
  'connection request', 'nye personer du kender', 'people you may know',
  'someone viewed your profile', 'din profil blev vist',
]

/** Domæner der ALDRIG markeres som støj — kerne-leverandører + interne. */
const PROTECTED_DOMAINS = new Set([
  'eltasolar.dk',
  // Grossister
  'ao.dk', 'lemu.dk', 'lemvigh-muller.dk', 'lemvighmuller.dk',
  'mikma.dk', 'fasetech.dk', 'solarsupply.dk',
  // Netselskaber
  'cerius.dk', 'radius.dk', 'trefor.dk', 'n1.dk', 'tre-for.dk',
  'energinet.dk',
  // Inverter/batteri-producenter (driftsrelevante notifikationer)
  'huawei.com', 'sungrow.com', 'goodwe.com', 'fronius.com',
])

/** Subject/body-mønstre der ALDRIG må markeres som støj — uanset
 *  hvor mailen kommer fra. Beskytter kerneforretnings-mails. */
const PROTECTED_KEYWORDS = [
  'tilbud', 'faktura', 'kreditnota', 'betaling',
  'ordrebekraeftelse', 'ordrebekræftelse', 'ordre ',
  'reklamation', 'sag ', 'sagsnummer', 'opgave',
  'arbejdsseddel', 'service', 'fejlmelding',
  'solcelle', 'installation', 'batteri', 'inverter',
  'ladestander', 'el-installation', 'eltavle',
  'måler', 'maaler',
]

/**
 * Klassificér om en mail er "støj" (reklame/system/social) ud fra
 * sender og subject/body. Returnerer true hvis støj — caller kan
 * så sætte link_status='ignored'.
 *
 * Sikkerhedsbælter:
 * 1. PROTECTED_DOMAINS afvises ALDRIG
 * 2. PROTECTED_KEYWORDS i subject/body afvises ALDRIG
 * 3. Først efter beskyttelse: tjek noise-mønstre
 */
export function classifyNoise(
  senderEmail: string,
  subject: string,
  bodyText: string | null,
  bodyHtml: string | null
): boolean {
  if (!senderEmail) return false
  const senderLower = senderEmail.toLowerCase()
  const atIdx = senderLower.indexOf('@')
  if (atIdx < 0) return false
  const senderPrefix = senderLower.substring(0, atIdx)
  const senderDomain = senderLower.substring(atIdx + 1)

  // Subject + first 1000 chars af body til keyword-tjek
  const subjectLower = (subject || '').toLowerCase()
  const bodyForCheck = (bodyText || stripHtml(bodyHtml || '')).toLowerCase().substring(0, 1000)
  const haystack = `${subjectLower} ${bodyForCheck}`

  // Beskyttelse 1: PROTECTED_DOMAINS — kerne-leverandører
  if (PROTECTED_DOMAINS.has(senderDomain)) return false
  for (const protectedDomain of PROTECTED_DOMAINS) {
    if (senderDomain === protectedDomain || senderDomain.endsWith(`.${protectedDomain}`)) {
      return false
    }
  }

  // Beskyttelse 2: PROTECTED_KEYWORDS — kerneforretningssprog
  for (const kw of PROTECTED_KEYWORDS) {
    if (haystack.includes(kw)) return false
  }

  // Tjek 1: noise sender-domæne (eksakt eller subdomæne)
  if (NOISE_SENDER_DOMAINS.has(senderDomain)) return true
  for (const noiseDomain of NOISE_SENDER_DOMAINS) {
    if (senderDomain.endsWith(`.${noiseDomain}`)) return true
  }

  // Tjek 2: noise subject-keyword (uafhængig af sender — typisk meget
  // entydigt: "unsubscribe", "newsletter", "verification code")
  for (const kw of NOISE_SUBJECT_KEYWORDS) {
    if (subjectLower.includes(kw)) return true
  }

  // Tjek 3: noise sender-prefix KOMBINERET med subject-keyword.
  // noreply@-mails kan stadig være relevante (ordrebekraeftelser),
  // så vi kraever ekstra signal i subject for at markere som støj.
  if (NOISE_SENDER_PREFIXES.some((p) => senderPrefix === p || senderPrefix.startsWith(`${p}-`))) {
    for (const kw of NOISE_SUBJECT_KEYWORDS) {
      if (subjectLower.includes(kw)) return true
    }
  }

  return false
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
  // Sprint 8C-3 noise filter: hvis ingen customer-match og mailen ligner
  // marketing/social/system-stoej, markér som 'ignored' i stedet for
  // 'unidentified'. Beskytter kerneforretnings-mails via PROTECTED_DOMAINS
  // og PROTECTED_KEYWORDS — disse markeres ALDRIG som stoej.
  let status: EmailLinkStatus
  let linkedBy: string | null
  if (match.customerId) {
    status = 'linked'
    linkedBy = 'auto'
  } else if (classifyNoise(extracted.email, subject, bodyText, bodyHtml)) {
    status = 'ignored'
    linkedBy = 'auto-noise'
  } else {
    status = 'unidentified'
    linkedBy = null
  }

  const updateData: Record<string, unknown> = {
    link_status: status,
    customer_id: match.customerId,
    customer_contact_id: match.customerContactId,
    linked_by: linkedBy,
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
