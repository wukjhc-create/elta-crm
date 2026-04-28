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

export type EmailType = 'customer' | 'supplier' | 'newsletter'

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

// =====================================================
// 1. CLASSIFY EMAIL
// =====================================================

export async function classifyEmail(email: EmailInput): Promise<EmailType> {
  const senderDomain = email.senderEmail.toLowerCase().split('@')[1] || ''
  const text = (email.bodyText || stripHtml(email.bodyHtml || '') || email.bodyPreview || '').toLowerCase()
  const subject = (email.subject || '').toLowerCase()

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
    `Du udtrækker den ÆGTE kunde fra en email-body — IKKE afsenderen, IKKE videresenderen, IKKE en grossist.

Returnér JSON med tre felter:
{
  "name": "Fulde navn eller firma — null hvis ikke nævnt",
  "phone": "Dansk telefonnummer (8 cifre, evt. +45) — null hvis ikke nævnt",
  "address": "Adresse inkl. postnummer og by — null hvis ikke nævnt"
}

Regler:
- Hvis indholdet er videresendt ("Fra:", "From:", "Videresendt besked", "Forwarded"), så vælg kunden FRA DET VIDERESENDTE INDHOLD — aldrig videresenderen selv.
- Ignorér helt: AO, Lemvigh-Müller, Solar A/S, Mikma, Eltagrossisten, og enhver "kundeservice"/"support"/"info"/"noreply"-signatur.
- Vælg den person, adresse og telefon som installationen reelt handler om.
- Hvis ingen ægte kunde kan identificeres, sæt feltet til null. Gæt ALDRIG.

Body:
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

  // 2. Match by name (company_name OR contact_person)
  if (data.name && data.name.length >= 3) {
    const safeName = data.name.replace(/[%,()]/g, ' ').trim()
    const { data: byName } = await supabase
      .from('customers')
      .select('id')
      .or(`company_name.ilike.${safeName},contact_person.ilike.${safeName}`)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (byName?.id) {
      console.log('CUSTOMER FOUND:', byName.id, '(by name)')
      return { customerId: byName.id, created: false }
    }
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

  // Generate next customer_number
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

  const displayName = data.name || data.phone || 'Ukendt kunde'
  const insertPayload = {
    customer_number: customerNumber,
    company_name: displayName,
    contact_person: data.name || displayName,
    email: data.fallbackEmail || `auto+${customerNumber.toLowerCase()}@elta-crm.local`,
    phone: data.phone,
    billing_address: data.address,
    is_active: true,
    tags: ['auto-email'],
    notes: 'Oprettet automatisk fra indgående email (AI-udtrukket)',
    created_by: adminProfile.id,
  }

  const { data: created, error } = await supabase
    .from('customers')
    .insert(insertPayload)
    .select('id')
    .single()

  if (error || !created) {
    logger.error('Failed to auto-create customer from email', { error, metadata: insertPayload })
    return { customerId: null, created: false }
  }

  console.log('CUSTOMER CREATED:', created.id, customerNumber, displayName)
  return { customerId: created.id, created: true }
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
  const supabase = createAdminClient()

  // -------- Stage 1: classify --------
  const type = await classifyEmail(email)
  console.log('EMAIL TYPE:', type, '—', email.subject)

  if (type === 'newsletter') {
    await supabase
      .from('incoming_emails')
      .update({ link_status: 'ignored', processed_at: new Date().toISOString() })
      .eq('id', emailId)
    await writeIntelligenceLog({
      emailId,
      subject: email.subject,
      classification: type,
      action: 'ignored',
      reason: 'Newsletter classification',
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
  const fallbackEmail =
    type === 'supplier' ? null : email.senderEmail || null

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
  const digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+45') && digits.length === 11) return digits
  if (digits.length === 8) return digits
  return digits
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

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
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

    const data = await res.json()
    return data.choices?.[0]?.message?.content || null
  } catch (err) {
    logger.warn('OpenAI request threw', { error: err })
    return null
  }
}
