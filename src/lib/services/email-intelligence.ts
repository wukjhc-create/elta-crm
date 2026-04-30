/**
 * Email Intelligence
 *
 * AI-powered classification + customer extraction for incoming emails.
 *
 * Pipeline:
 *   1. classifyEmail()      → 'customer' | 'supplier' | 'newsletter'
 *   2. extractCustomer()    → { name, phone, address } from body (LLM)
 *   3. findOrCreateCustomer() → match by phone, then name; create if missing
 *
 * Used by email-sync-orchestrator after each email is inserted.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import {
  createCaseFromEmail,
  createSmartTasks,
  detectIntent,
  detectPriority,
  generateCaseAiSummary,
  writeCaseNote,
} from '@/lib/services/auto-case'
import { createOfferDraftFromCase } from '@/lib/services/auto-offer'
import { canSpendAi, recordAiCall } from '@/lib/services/ai-budget'
import { retryOnUniqueViolation } from '@/lib/utils/retry'
import { normalizeDanishPhone } from '@/lib/utils/phone'

const OPENAI_TIMEOUT_MS = 15_000

// =====================================================
// Constants
// =====================================================

const SUPPLIER_DOMAINS = new Set([
  'mikma.dk',
  'lemvigmueller.dk',
  'lemvigh-muller.dk',
  'lemvighmuller.dk',
  'solar.dk',
  'ao.dk',
  'eltagrossisten.dk',
])

const SUPPLIER_SIGNATURE_MARKERS = [
  'lemvigh-müller',
  'lemvigh-muller',
  'lemvigmüller',
  'lemvigmuller',
  'solar a/s',
  'solar danmark',
  'mikma a/s',
  'ao a/s',
  'ao.dk',
  'eltagrossisten',
  'kundeservice',
  'do not reply',
  'noreply',
  'no-reply',
  'support@',
  'info@',
]

const FORWARD_HEADERS = [
  /^[ \t>]*-{2,}\s*(videresendt besked|forwarded message|original besked|original message)\s*-{2,}/im,
  /^[ \t>]*Fra:\s/im,
  /^[ \t>]*From:\s/im,
  /^[ \t>]*Afsender:\s/im,
]

// Hard ignore filters — applied BEFORE any AI call.
const IGNORE_SENDER_SUBSTRINGS = [
  'no-reply',
  'noreply',
  'do-not-reply',
  'donotreply',
  'mailer-daemon',
  'postmaster@',
  'bounce@',
  'bounces@',
  'notifications@',
  'notification@',
  'alerts@',
  'submissions@',
  'newsletter@',
  'marketing@',
  'newsletters@',
  'instagram.com',
  'facebookmail.com',
]

const IGNORE_SUBJECT_KEYWORDS = [
  'activate',
  'aktivér',
  'aktiver',
  'verify',
  'verifikation',
  'verifikationskode',
  'confirm',
  'bekræft',
  'notification',
  'notifikation',
  'welcome',
  'velkommen',
  'reset password',
  'nulstil adgangskode',
  'password reset',
  'unsubscribe',
  'afmeld',
  'undelivered mail',
  'mail delivery failed',
  'out of office',
  'fraværende',
  'fravær',
]

const IGNORE_DOMAINS = new Set([
  'formsubmit.co',
  'instagram.com',
  'facebook.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'mailchimp.com',
  'sendgrid.net',
  'mailerlite.com',
  'klaviyo.com',
  'github.com',
  'notion.so',
  'slack.com',
  'zoom.us',
])

// Priority subject keywords (Danish CRM intent)
const PRIORITY_SUBJECT_KEYWORDS = [
  'tilbud',
  'forespørgsel',
  'foresporgsel',
  'installation',
  'projekt',
]

// Heuristics for body content scoring (not used for extraction — only scoring)
const PHONE_RE = /(?:\+45[\s-]?)?(?:\d[\s-]?){8}\d?/
const POSTCODE_CITY_RE = /\b\d{4}\s+[A-ZÆØÅ][a-zæøåA-ZÆØÅ\-]+/
const FULL_NAME_RE = /\b[A-ZÆØÅ][a-zæøå]{1,}\s+[A-ZÆØÅ][a-zæøå]{1,}(?:\s+[A-ZÆØÅ][a-zæøå]{1,})?\b/

const NEWSLETTER_KEYWORDS = [
  'unsubscribe',
  'afmeld nyhedsbrev',
  'afmeld dig',
  'nyhedsbrev',
  'newsletter',
  '% rabat',
  'tilbud kun i dag',
  'klik her for at se',
  'view in browser',
  'se i browser',
]

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_MODEL = 'gpt-4o-mini'

export type EmailType = 'customer' | 'supplier' | 'newsletter' | 'ignored'

// =====================================================
// Priority scoring
// =====================================================

export function scoreEmail(email: EmailInput): number {
  const senderEmailLower = (email.senderEmail || '').toLowerCase()
  const senderDomain = senderEmailLower.split('@')[1] || ''
  const subject = (email.subject || '').toLowerCase()
  const body = email.bodyText || stripHtml(email.bodyHtml || '') || email.bodyPreview || ''

  let score = 0

  // +2 per body signal (phone / address / full name)
  if (PHONE_RE.test(body)) score += 2
  if (POSTCODE_CITY_RE.test(body)) score += 2
  if (FULL_NAME_RE.test(body)) score += 2

  // +1 per CRM-intent subject keyword
  if (PRIORITY_SUBJECT_KEYWORDS.some((kw) => subject.includes(kw))) score += 1

  // -2 if sender matches ignore rules
  if (
    IGNORE_DOMAINS.has(senderDomain) ||
    IGNORE_SENDER_SUBSTRINGS.some((s) => senderEmailLower.includes(s))
  ) {
    score -= 2
  }

  // -1 if subject matches ignore keywords
  if (IGNORE_SUBJECT_KEYWORDS.some((kw) => subject.includes(kw))) score -= 1

  return score
}

export interface EmailInput {
  subject: string
  senderEmail: string
  senderName: string | null
  bodyText: string | null
  bodyHtml: string | null
  bodyPreview: string | null
}

export interface ExtractedCustomer {
  name: string | null
  phone: string | null
  address: string | null
  confidence: number
}

/**
 * Returns true if the email body or subject contains forward markers
 * (e.g. "Fra:", "From:", "Videresendt besked", "Forwarded message", "VS:", "Fwd:").
 * Used to:
 *   1. Force the intelligence pipeline to run even when the email-linker
 *      already matched a sender (the real customer is in the body).
 *   2. Block the sender email from being used as the auto-created
 *      customer's email (would otherwise leak the forwarder's address).
 */
export function isForwardedEmail(email: EmailInput): boolean {
  const subject = (email.subject || '').toLowerCase()
  if (/^(vs|fwd|fw|vb)[:\s]/i.test(subject)) return true
  const body = email.bodyText || stripHtml(email.bodyHtml || '') || email.bodyPreview || ''
  return FORWARD_HEADERS.some((re) => re.test(body))
}

// =====================================================
// 1. CLASSIFY EMAIL
// =====================================================

export async function classifyEmail(email: EmailInput): Promise<EmailType> {
  const senderEmailLower = (email.senderEmail || '').toLowerCase()
  const senderDomain = senderEmailLower.split('@')[1] || ''
  const text = (email.bodyText || stripHtml(email.bodyHtml || '') || email.bodyPreview || '').toLowerCase()
  const subject = (email.subject || '').toLowerCase()

  // -------- HARD ignore filters (no AI) --------
  if (IGNORE_DOMAINS.has(senderDomain)) return 'ignored'
  if (IGNORE_SENDER_SUBSTRINGS.some((s) => senderEmailLower.includes(s))) return 'ignored'
  if (IGNORE_SUBJECT_KEYWORDS.some((kw) => subject.includes(kw))) return 'ignored'

  if (SUPPLIER_DOMAINS.has(senderDomain)) return 'supplier'

  const hasNewsletterMarker = NEWSLETTER_KEYWORDS.some((kw) => text.includes(kw) || subject.includes(kw))
  if (hasNewsletterMarker) return 'newsletter'

  const ai = await callOpenAI(
    `Du klassificerer indgående emails til et dansk el/solcelle-firma. Returnér ÉN af tre værdier: "customer", "supplier", "newsletter".

Definitioner:
- "newsletter": marketing-mail, automatiske kampagner, "afmeld nyhedsbrev", "% rabat", "tilbud kun i dag", masse-udsendelser.
- "supplier": grossister/leverandører som AO, Lemvigh-Müller, Solar A/S, Mikma — ordrebekræftelser, fakturaer, leveringer, prislister.
- "customer": private eller virksomheder der spørger om tilbud, opfølgning, sag, projekt, installation, fejl, eller anden sagsbehandling.

Emne: ${email.subject || '(intet)'}
Afsender: ${email.senderName || ''} <${email.senderEmail}>
Body (første 1500 tegn):
${(email.bodyText || stripHtml(email.bodyHtml || '') || email.bodyPreview || '').substring(0, 1500)}

Svar KUN med rå JSON: {"type":"customer"} eller {"type":"supplier"} eller {"type":"newsletter"}.`,
    { type: 'json_object' }
  )

  if (ai) {
    try {
      const parsed = JSON.parse(ai)
      if (parsed.type === 'customer' || parsed.type === 'supplier' || parsed.type === 'newsletter') {
        return parsed.type
      }
    } catch {
      // fall through
    }
  }

  return 'customer'
}

// =====================================================
// 2. EXTRACT CUSTOMER FROM BODY (AI)
// =====================================================

export async function extractCustomer(body: string): Promise<ExtractedCustomer> {
  const raw = (body || '').trim()
  if (!raw) return { name: null, phone: null, address: null, confidence: 0 }

  // 1. Prefer forwarded content if present — slice from the FIRST forward header onward
  const forwarded = isolateForwardedSection(raw)
  // 2. Strip blocks that look like supplier signatures
  const cleaned = stripSupplierSignatures(forwarded).substring(0, 4000)
  if (!cleaned.trim()) return { name: null, phone: null, address: null, confidence: 0 }

  const ai = await callOpenAI(
    `Du udtrækker den ÆGTE slutkunde (privat eller erhverv) fra en email-body til et dansk el/solcelle-firma.
Du udtrækker IKKE: afsender, videresender, grossist, kollega, eller firma-signatur.

Returnér JSON:
{
  "name": "Fulde navn på person eller firma — null hvis ikke entydigt nævnt",
  "phone": "Dansk telefonnummer (8 cifre, evt. +45) — null hvis ikke nævnt",
  "address": "Komplet adresse: gade + nr + postnummer + by — null hvis ikke nævnt"
}

REGLER (overhold strikt):
- Hvis emailen er videresendt (markører: "Fra:", "From:", "Videresendt besked", "Forwarded"), så vælg kunden FRA DET VIDERESENDTE INDHOLD. Aldrig videresenderen.
- Ignorér disse afsendere/firmaer fuldstændigt: AO, Lemvigh-Müller, Solar A/S, Mikma, Eltagrossisten, EnergiNord, energinet.dk, samt enhver "kundeservice"/"support"/"info"/"noreply"/"reception"/"webmaster"-signatur.
- Adressen skal indeholde mindst gade + nr + postnummer (4 cifre). Hvis kun en by er nævnt → null.
- Telefonen skal være et dansk nummer (8 cifre, evt. +45). Drop kontornumre der hører til afsender-firmaet.
- Hvis du er i tvivl om en værdi, skal den være null. Gæt ALDRIG. Vi skal hellere have null end forkerte data.
- Returnér null for navn hvis det kun er et fornavn uden kontekst, eller en fælles e-mail-alias.

Body (oprenset, første 4000 tegn):
${cleaned}

Svar KUN med rå JSON.`,
    { type: 'json_object' }
  )

  if (!ai) {
    const empty = { name: null, phone: null, address: null, confidence: 0 }
    console.log('EXTRACTED:', empty)
    console.log('CONFIDENCE:', 0)
    return empty
  }

  try {
    const parsed = JSON.parse(ai)
    const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : null
    const phone = typeof parsed.phone === 'string' && parsed.phone.trim() ? normalizePhone(parsed.phone) : null
    const address = typeof parsed.address === 'string' && parsed.address.trim() ? parsed.address.trim() : null
    const confidence = (phone ? 0.5 : 0) + (address ? 0.3 : 0) + (name ? 0.2 : 0)
    const result = { name, phone, address, confidence }
    console.log('EXTRACTED:', { name, phone, address })
    console.log('CONFIDENCE:', confidence)
    return result
  } catch {
    const empty = { name: null, phone: null, address: null, confidence: 0 }
    console.log('EXTRACTED:', empty)
    console.log('CONFIDENCE:', 0)
    return empty
  }
}

function isolateForwardedSection(text: string): string {
  let firstIdx = -1
  for (const re of FORWARD_HEADERS) {
    const m = text.match(re)
    if (m && m.index !== undefined) {
      if (firstIdx === -1 || m.index < firstIdx) firstIdx = m.index
    }
  }
  if (firstIdx === -1) return text
  return text.substring(firstIdx)
}

function stripSupplierSignatures(text: string): string {
  const lines = text.split(/\r?\n/)
  const kept: string[] = []
  let skipping = false
  let skipBudget = 0
  for (const line of lines) {
    const lower = line.toLowerCase()
    const looksLikeSupplier = SUPPLIER_SIGNATURE_MARKERS.some((m) => lower.includes(m))
    if (looksLikeSupplier) {
      skipping = true
      skipBudget = 8 // drop ~8 trailing signature lines after a supplier marker
      continue
    }
    if (skipping) {
      if (skipBudget-- <= 0 || line.trim() === '') {
        skipping = skipBudget > 0 && line.trim() === ''
      }
      if (skipping) continue
    }
    kept.push(line)
  }
  return kept.join('\n')
}

// =====================================================
// 3. FIND OR CREATE CUSTOMER
// =====================================================

export interface FindOrCreateInput {
  name: string | null
  phone: string | null
  address: string | null
  fallbackEmail?: string | null
}

export interface FindOrCreateResult {
  customerId: string | null
  created: boolean
}

export async function findOrCreateCustomer(data: FindOrCreateInput): Promise<FindOrCreateResult> {
  const supabase = createAdminClient()

  // 1. Match by phone (most reliable)
  if (data.phone) {
    const phoneNorm = normalizePhone(data.phone)
    const { data: byPhone } = await supabase
      .from('customers')
      .select('id')
      .or(`phone.eq.${phoneNorm},mobile.eq.${phoneNorm}`)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (byPhone?.id) {
      console.log('CUSTOMER FOUND:', byPhone.id, '(by phone)')
      return { customerId: byPhone.id, created: false }
    }
  }

  // 2. Match by name — require a full name (must contain a space) to avoid
  //    false positives where a single first name matches an unrelated customer.
  const nameTrimmed = (data.name || '').trim()
  const looksLikeFullName = nameTrimmed.includes(' ') && nameTrimmed.length >= 5
  if (looksLikeFullName) {
    const safeName = nameTrimmed.replace(/[%,()]/g, ' ').trim()
    const { data: byName } = await supabase
      .from('customers')
      .select('id')
      .or(`company_name.ilike.${safeName},contact_person.ilike.${safeName}`)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (byName?.id) {
      console.log('CUSTOMER FOUND:', byName.id, '(by full name)')
      return { customerId: byName.id, created: false }
    }
  } else if (nameTrimmed.length >= 3) {
    console.log('CUSTOMER NAME-MATCH SKIPPED (single token):', nameTrimmed)
  }

  // 3. Create — REQUIRES phone (>= 8 digits) OR address (>= 5 chars). Name alone is NOT enough.
  const hasPhone = !!(data.phone && data.phone.replace(/\D/g, '').length >= 8)
  const hasAddress = !!(data.address && data.address.trim().length >= 5)
  if (!hasPhone && !hasAddress) {
    console.log('SKIP: NO VALID CUSTOMER DATA', { name: data.name, phone: data.phone, address: data.address })
    return { customerId: null, created: false }
  }

  // Need a created_by FK. Use first admin profile as system actor.
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()

  if (!adminProfile?.id) {
    console.warn('CUSTOMER CREATE SKIPPED: no admin profile available for created_by')
    return { customerId: null, created: false }
  }

  const displayName = data.name || data.phone || 'Ukendt kunde'
  const normalizedPhone = data.phone ? normalizeDanishPhone(data.phone) : null

  // Race-safe: each attempt re-reads MAX(customer_number)+1 and retries on 23505.
  const result = await retryOnUniqueViolation<{ id: string; customer_number: string }>(
    async () => {
      const { data: lastCustomer } = await supabase
        .from('customers')
        .select('customer_number')
        .order('customer_number', { ascending: false })
        .limit(1)

      let customerNumber = 'C000001'
      if (lastCustomer && lastCustomer.length > 0) {
        const numPart = parseInt(lastCustomer[0].customer_number.substring(1), 10)
        if (!Number.isNaN(numPart)) {
          customerNumber = `C${(numPart + 1).toString().padStart(6, '0')}`
        }
      }

      return await supabase
        .from('customers')
        .insert({
          customer_number: customerNumber,
          company_name: displayName,
          contact_person: data.name || displayName,
          email: data.fallbackEmail || `auto+${customerNumber.toLowerCase()}@elta-crm.local`,
          phone: normalizedPhone,
          billing_address: data.address,
          is_active: true,
          tags: ['auto-email'],
          notes: 'Oprettet automatisk fra indgående email (AI-udtrukket)',
          created_by: adminProfile.id,
        })
        .select('id, customer_number')
        .single()
    },
    3,
    'customer_number'
  )

  if (result.error || !result.data) {
    logger.error('Failed to auto-create customer from email', {
      error: result.error,
      metadata: { displayName, hasPhone: !!normalizedPhone, hasAddress: !!data.address },
    })
    return { customerId: null, created: false }
  }

  console.log('CUSTOMER CREATED:', result.data.id, result.data.customer_number, displayName)
  return { customerId: result.data.id, created: true }
}

// =====================================================
// 4. ORCHESTRATION — used by email-sync-orchestrator
// =====================================================

export interface IntelligenceResult {
  type: EmailType
  customerId: string | null
  created: boolean
  skipped: boolean
}

export async function processEmailIntelligence(
  emailId: string,
  email: EmailInput
): Promise<IntelligenceResult> {
  try {
    return await processEmailIntelligenceUnsafe(emailId, email)
  } catch (err) {
    // Top-level safety net — a single malformed email must NEVER crash the sync.
    console.error('INTELLIGENCE PIPELINE FAILED:', email?.subject, err)
    logger.error('processEmailIntelligence top-level failure', {
      entityId: emailId,
      error: err,
    })
    try {
      const { logHealth } = await import('@/lib/services/system-health')
      const msg = err instanceof Error ? err.message : String(err)
      await logHealth('email_intel', 'error', `intelligence threw: ${msg}`, { emailId, subject: email?.subject?.slice(0, 200) })
    } catch { /* never crash */ }
    return { type: 'customer', customerId: null, created: false, skipped: true }
  }
}

async function processEmailIntelligenceUnsafe(
  emailId: string,
  email: EmailInput
): Promise<IntelligenceResult> {
  const supabase = createAdminClient()

  // -------- Stage 0: priority score (no AI) --------
  const score = scoreEmail(email)
  console.log('EMAIL SCORE:', score, email.subject)

  if (score < 0) {
    console.log('EMAIL IGNORED:', email.subject)
    await supabase
      .from('incoming_emails')
      .update({ link_status: 'ignored', processed_at: new Date().toISOString() })
      .eq('id', emailId)
    await writeIntelligenceLog({
      emailId,
      subject: email.subject,
      classification: 'ignored',
      action: 'ignored',
      reason: `Score ${score} (negative — hard ignore)`,
    })
    return { type: 'ignored', customerId: null, created: false, skipped: true }
  }

  if (score < 2) {
    console.log('LOW SCORE SKIP —', email.subject, 'score:', score)
    await supabase
      .from('incoming_emails')
      .update({ link_status: 'unidentified', processed_at: new Date().toISOString() })
      .eq('id', emailId)
    await writeIntelligenceLog({
      emailId,
      subject: email.subject,
      classification: 'customer',
      action: 'skipped',
      reason: `Score ${score} (below threshold 2 — low priority)`,
    })
    return { type: 'customer', customerId: null, created: false, skipped: true }
  }

  // -------- Stage 1: classify --------
  const type = await classifyEmail(email)
  console.log('EMAIL TYPE:', type, '—', email.subject)

  // Hard-ignored or newsletter → skip ALL AI extraction, mark email ignored.
  if (type === 'ignored' || type === 'newsletter') {
    if (type === 'ignored') {
      console.log('EMAIL IGNORED:', email.subject)
    }
    await supabase
      .from('incoming_emails')
      .update({ link_status: 'ignored', processed_at: new Date().toISOString() })
      .eq('id', emailId)
    await writeIntelligenceLog({
      emailId,
      subject: email.subject,
      classification: type,
      action: 'ignored',
      reason: type === 'ignored' ? 'Hard ignore filter (sender/subject/domain)' : 'Newsletter classification',
    })
    return { type, customerId: null, created: false, skipped: true }
  }

  if (type === 'supplier') {
    console.log('SUPPLIER EMAIL PARSED —', email.subject, 'from:', email.senderEmail)
  }

  // -------- Stage 2: extract --------
  const body =
    email.bodyText || stripHtml(email.bodyHtml || '') || email.bodyPreview || ''
  const extracted = await extractCustomer(body)

  if (!extracted.name && !extracted.phone) {
    console.log('SKIP: NO VALID CUSTOMER DATA —', email.subject)
    await supabase
      .from('incoming_emails')
      .update({ link_status: 'unidentified', processed_at: new Date().toISOString() })
      .eq('id', emailId)
    await writeIntelligenceLog({
      emailId,
      subject: email.subject,
      classification: type,
      extractedName: extracted.name,
      extractedPhone: extracted.phone,
      extractedAddress: extracted.address,
      confidence: extracted.confidence,
      action: 'skipped',
      reason: 'No name and no phone extracted',
    })
    return { type, customerId: null, created: false, skipped: true }
  }

  if (extracted.confidence < 0.5) {
    console.log('LOW CONFIDENCE SKIP —', email.subject, 'confidence:', extracted.confidence)
    await supabase
      .from('incoming_emails')
      .update({ link_status: 'unidentified', processed_at: new Date().toISOString() })
      .eq('id', emailId)
    await writeIntelligenceLog({
      emailId,
      subject: email.subject,
      classification: type,
      extractedName: extracted.name,
      extractedPhone: extracted.phone,
      extractedAddress: extracted.address,
      confidence: extracted.confidence,
      action: 'skipped',
      reason: `Low confidence (${extracted.confidence})`,
    })
    return { type, customerId: null, created: false, skipped: true }
  }

  // -------- Stage 3: decide (match or create) --------
  // Suppress sender-as-customer-email when:
  //  (a) the email is from a supplier (sender is the supplier, not the customer)
  //  (b) the body is forwarded (sender is the forwarder, not the customer)
  const isForwarded = isForwardedEmail(email)
  const suppressSenderEmail = type === 'supplier' || isForwarded
  const fallbackEmail = suppressSenderEmail ? null : email.senderEmail || null
  if (suppressSenderEmail) {
    console.log('FALLBACK EMAIL SUPPRESSED:', { reason: type === 'supplier' ? 'supplier' : 'forwarded' })
  }

  const { customerId, created } = await findOrCreateCustomer({
    ...extracted,
    fallbackEmail,
  })

  let action: 'created' | 'matched' | 'skipped' = 'skipped'
  let reason = 'No phone and no address — creation refused'
  if (customerId && created) {
    action = 'created'
    reason = 'New customer auto-created from extracted data'
  } else if (customerId && !created) {
    action = 'matched'
    reason = 'Matched existing customer'
  }

  if (customerId) {
    await supabase
      .from('incoming_emails')
      .update({
        customer_id: customerId,
        link_status: 'linked',
        linked_by: 'auto-ai',
        linked_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      })
      .eq('id', emailId)

    // Auto-case creation — strict relevance guard.
    // Required:
    //   1. classification ∈ {'customer','supplier'}
    //   2. score >= 2
    //   3. extracted.phone OR extracted.address present
    let caseSkipReason: string | null = null
    if (type !== 'customer' && type !== 'supplier') {
      caseSkipReason = `classification=${type} (must be customer or supplier)`
    } else if (score < 2) {
      caseSkipReason = `score=${score} (below 2)`
    } else if (!extracted.phone && !extracted.address) {
      caseSkipReason = 'no phone and no address extracted'
    }

    if (caseSkipReason) {
      console.log('CASE SKIPPED:', caseSkipReason)
    } else {
      // Each post-customer step is isolated. A failure in one MUST NOT
      // prevent the next from running, and MUST NOT crash the email sync.
      const intent = detectIntent(email.subject || '', body)
      const priority = detectPriority(email.subject || '', body, intent)

      let caseId: string | null = null

      // Step 1: case
      try {
        caseId = await createCaseFromEmail(
          {
            id: emailId,
            subject: email.subject,
            body,
            extractedName: extracted.name,
            extractedAddress: extracted.address,
            intent,
            priority,
          },
          customerId
        )
        if (caseId) console.log('CASE CREATED:', caseId, 'intent:', intent, 'priority:', priority)
      } catch (caseErr) {
        console.warn('CASE CREATION FAILED:', email.subject, caseErr instanceof Error ? caseErr.message : '')
      }

      // Step 2: smart tasks (only if we have a case)
      if (caseId) {
        try {
          await createSmartTasks(caseId, intent)
        } catch (taskErr) {
          console.warn('SMART TASKS FAILED:', email.subject, taskErr instanceof Error ? taskErr.message : '')
        }
      }

      // Step 3: offer draft — STRICTER gate than case creation.
      //   Required: classification ∈ {customer, supplier} AND score >= 3.
      //   Customer is already linked at this point. Existing offer (per
      //   source_email_id UNIQUE index) is returned by createOfferDraftFromCase.
      let offerSkipReason: string | null = null
      if (type !== 'customer' && type !== 'supplier') {
        offerSkipReason = `classification=${type} (must be customer or supplier)`
      } else if (score < 3) {
        offerSkipReason = `score=${score} (offer requires >=3)`
      }

      if (offerSkipReason) {
        console.log('OFFER SKIPPED:', offerSkipReason)
      } else {
        try {
          const offerId = await createOfferDraftFromCase({
            emailId,
            caseId,
            customerId,
            subject: email.subject || '',
            body,
            extractedAddress: extracted.address,
            extractedName: extracted.name,
            intent,
            priority,
          })
          if (offerId) console.log('OFFER CREATED:', offerId)
        } catch (offerErr) {
          console.warn('OFFER DRAFT FAILED:', email.subject, offerErr instanceof Error ? offerErr.message : '')
        }
      }

      // Step 4: AI summary as case note (only if we have a case)
      if (caseId) {
        try {
          const summary = await generateCaseAiSummary(email.subject || '', body)
          if (summary?.summary) {
            await writeCaseNote({
              caseId,
              content: summary.summary,
              kind: 'ai_summary',
              urgency: summary.urgency,
            })
            console.log('CASE SUMMARY NOTE:', summary.urgency, '—', summary.summary.substring(0, 80))
          }
        } catch (sumErr) {
          console.warn('AI SUMMARY FAILED:', email.subject, sumErr instanceof Error ? sumErr.message : '')
        }
      }
    }
  }

  await writeIntelligenceLog({
    emailId,
    subject: email.subject,
    classification: type,
    extractedName: extracted.name,
    extractedPhone: extracted.phone,
    extractedAddress: extracted.address,
    confidence: extracted.confidence,
    action,
    reason,
    customerId,
  })

  return { type, customerId, created, skipped: action === 'skipped' }
}

async function writeIntelligenceLog(input: {
  emailId: string
  subject: string
  classification: EmailType
  extractedName?: string | null
  extractedPhone?: string | null
  extractedAddress?: string | null
  confidence?: number
  action: 'linked' | 'created' | 'matched' | 'skipped' | 'ignored'
  reason: string
  customerId?: string | null
}): Promise<void> {
  // Logging is observability-only — it must NEVER throw, NEVER reject,
  // NEVER block the email processing pipeline.
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('email_intelligence_logs').insert({
      email_id: input.emailId,
      subject: input.subject || null,
      classification: input.classification,
      extracted_name: input.extractedName ?? null,
      extracted_phone: input.extractedPhone ?? null,
      extracted_address: input.extractedAddress ?? null,
      confidence: input.confidence ?? null,
      action: input.action,
      reason: input.reason,
      customer_id: input.customerId ?? null,
    })
    if (error) {
      console.error('INTELLIGENCE LOG FAILED', error)
    }
  } catch (err) {
    console.error('INTELLIGENCE LOG FAILED', err)
  }
}

// =====================================================
// Helpers
// =====================================================

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

function normalizePhone(raw: string): string {
  return normalizeDanishPhone(raw) ?? raw.replace(/[^\d+]/g, '')
}

async function callOpenAI(
  prompt: string,
  responseFormat?: { type: 'json_object' }
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not set — email intelligence falling back to heuristics')
    return null
  }

  // Daily cost cap — refuse before hitting the network.
  if (!(await canSpendAi())) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: responseFormat,
        messages: [
          { role: 'system', content: 'Du er en præcis dansk klassifikations- og udtrækningsmotor. Svar altid med ren JSON uden markdown.' },
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!res.ok) {
      logger.warn('OpenAI request failed', { metadata: { status: res.status, body: (await res.text()).substring(0, 200) } })
      return null
    }

    // Count successful API calls toward the daily cap (best-effort).
    void recordAiCall(1)

    const data = await res.json()
    return data.choices?.[0]?.message?.content || null
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError'
    if (aborted) {
      logger.warn('OpenAI request aborted (timeout)', { metadata: { timeoutMs: OPENAI_TIMEOUT_MS } })
    } else {
      logger.warn('OpenAI request threw', { error: err })
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}
