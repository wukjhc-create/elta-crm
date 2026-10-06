/**
 * K5 — automatisk kobling af synkede mails til kunder med sikker confidence-model (Henrik 2026-10-06).
 *
 * Erstatter linkEmail() i sync-cronen, NÅR MAIL_AUTOLINK_ENABLED='true' (default fra → uændret prod-adfærd).
 * Forskelle fra linkEmail():
 *   - kører med admin-klienten (cronen har ingen bruger-session; som anon koblede linkeren næsten intet)
 *   - beslutningen træffes af decideAutoLink(): præcis e-mail/kontakt eller entydig samtale → kobles;
 *     kun domæne → forslag (kobles ikke); tvetydigt → aldrig automatisk
 *   - overskriver ALDRIG en eksisterende kobling: opdateringen er betinget af customer_id IS NULL
 *   - hver automatisk kobling og hvert forslag skrives i audit_logs (entity_type 'incoming_email')
 *   - FormSubmit-webhenvendelser og interne afsendere (eget domæne) matches ikke på afsender
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { escapeLike } from '@/lib/validations/postgrest-filter'
import { isFreeMailDomain } from '@/lib/email/free-mail-domains'
import { extractOriginalSender, classifyNoise } from '@/lib/services/email-linker'
import { decideAutoLink, type AutoLinkDecision, type AutoLinkSignals } from '@/lib/mail/autolink-policy'
import { logger } from '@/lib/utils/logger'
import type { LinkResult, EmailLinkStatus } from '@/types/mail-bridge.types'

type Admin = ReturnType<typeof createAdminClient>

/** Afsender-domæner der aldrig matches som kunde: eget domæne og formular-relæet (kunden står i formularen) */
const NON_CUSTOMER_SENDER_DOMAINS = ['eltasolar.dk', 'formsubmit.co']
const CANDIDATE_LIMIT = 5

export function isAutoLinkEnabled(): boolean {
  return process.env.MAIL_AUTOLINK_ENABLED === 'true'
}

function senderDomain(email: string): string {
  return email.toLowerCase().split('@')[1] || ''
}

function isNonCustomerDomain(domain: string): boolean {
  return NON_CUSTOMER_SENDER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))
}

/** Saml kandidat-kunder pr. signal. Fejl i ét opslag giver tomt signal (aldrig et gæt). */
export async function gatherAutoLinkSignals(
  admin: Admin,
  emailId: string,
  email: string,
  conversationId: string | null
): Promise<{ signals: AutoLinkSignals; contactIdByCustomer: Map<string, string>; threadCaseByCustomer: Map<string, string | null> }> {
  const signals: AutoLinkSignals = { exactCustomerIds: [], contactCustomerIds: [], threadCustomerIds: [], domainCustomerIds: [] }
  const contactIdByCustomer = new Map<string, string>()
  const threadCaseByCustomer = new Map<string, string | null>()
  const emailLower = email.toLowerCase().trim()
  const domain = senderDomain(emailLower)
  const matchSender = !!domain && !isNonCustomerDomain(domain)

  if (matchSender) {
    const { data: exact, error: e1 } = await admin
      .from('customers').select('id').ilike('email', escapeLike(emailLower)).eq('is_active', true).limit(CANDIDATE_LIMIT)
    if (e1) logger.warn('autolink: kunde-opslag fejlede', { entity: 'incoming_emails', entityId: emailId, error: e1 })
    signals.exactCustomerIds = (exact ?? []).map((r) => r.id as string)

    const { data: contacts, error: e2 } = await admin
      .from('customer_contacts').select('id, customer_id').ilike('email', escapeLike(emailLower)).limit(CANDIDATE_LIMIT)
    if (e2) logger.warn('autolink: kontakt-opslag fejlede', { entity: 'incoming_emails', entityId: emailId, error: e2 })
    for (const c of contacts ?? []) {
      if (!c.customer_id) continue
      signals.contactCustomerIds.push(c.customer_id as string)
      if (!contactIdByCustomer.has(c.customer_id as string)) contactIdByCustomer.set(c.customer_id as string, c.id as string)
    }
  }

  if (conversationId) {
    const { data: thread, error: e3 } = await admin
      .from('incoming_emails').select('customer_id, service_case_id')
      .eq('conversation_id', conversationId).eq('link_status', 'linked').not('customer_id', 'is', null).neq('id', emailId)
      .limit(20)
    if (e3) logger.warn('autolink: samtale-opslag fejlede', { entity: 'incoming_emails', entityId: emailId, error: e3 })
    for (const t of thread ?? []) {
      const cid = t.customer_id as string
      signals.threadCustomerIds.push(cid)
      // service_case_id arves kun, hvis alle koblede mails i samtalen peger på samme sag
      const prev = threadCaseByCustomer.get(cid)
      const sc = (t.service_case_id as string | null) ?? null
      threadCaseByCustomer.set(cid, prev === undefined ? sc : prev === sc ? sc : null)
    }
  }

  if (matchSender && !isFreeMailDomain(domain)) {
    const { data: dom, error: e4 } = await admin
      .from('customers').select('id').ilike('email', `%@${escapeLike(domain)}`).eq('is_active', true).limit(CANDIDATE_LIMIT)
    if (e4) logger.warn('autolink: domæne-opslag fejlede', { entity: 'incoming_emails', entityId: emailId, error: e4 })
    signals.domainCustomerIds = (dom ?? []).map((r) => r.id as string)
  }

  return { signals, contactIdByCustomer, threadCaseByCustomer }
}

async function audit(admin: Admin, emailId: string, subject: string, decision: AutoLinkDecision) {
  if (decision.action === 'none') return
  const linked = decision.action === 'link'
  const { error } = await admin.from('audit_logs').insert({
    user_id: null,
    user_name: 'Mail-automatik',
    entity_type: 'incoming_email',
    entity_id: emailId,
    entity_name: (subject || '(Intet emne)').slice(0, 120),
    action: linked ? 'email_auto_linked' : 'email_link_suggested',
    action_description: linked ? `Mail koblet automatisk (${decision.reason})` : `Forslag til manuel kobling (${decision.reason})`,
    metadata: linked
      ? { source: 'k5', customer_id: decision.customerId, matched_on: decision.matchedOn }
      : { source: 'k5', candidate_customer_ids: decision.candidateIds, matched_on: decision.matchedOn },
  })
  if (error) logger.error('autolink: audit-log fejlede', { entity: 'incoming_emails', entityId: emailId, error })
}

/** Samme signatur som linkEmail(), så orkestratoren kan vælge via flaget. */
export async function autoLinkEmail(
  emailId: string,
  senderEmail: string,
  senderName: string | null,
  subject: string,
  bodyHtml: string | null,
  bodyText: string | null
): Promise<LinkResult> {
  const admin = createAdminClient()

  const { data: row, error: rowErr } = await admin
    .from('incoming_emails').select('customer_id, customer_contact_id, conversation_id').eq('id', emailId).maybeSingle()
  if (rowErr || !row) {
    logger.error('autolink: mail ikke fundet', { entity: 'incoming_emails', entityId: emailId, error: rowErr })
    return { emailId, status: 'unidentified', customerId: null, customerContactId: null, matchedOn: null, confidence: 'low' }
  }
  // Allerede koblet (manuelt, godkendt eller tidligere automatik) → rør intet
  if (row.customer_id) {
    return { emailId, status: 'linked', customerId: row.customer_id as string, customerContactId: (row.customer_contact_id as string | null) ?? null, matchedOn: null, confidence: 'high' }
  }

  const extracted = extractOriginalSender(senderEmail, senderName, subject, bodyHtml, bodyText)
  const { signals, contactIdByCustomer, threadCaseByCustomer } = await gatherAutoLinkSignals(admin, emailId, extracted.email, (row.conversation_id as string | null) ?? null)
  const decision = decideAutoLink(signals)
  const now = new Date().toISOString()

  let status: EmailLinkStatus
  const update: Record<string, unknown> = {
    original_sender_email: extracted.isForwarded ? extracted.email : null,
    original_sender_name: extracted.isForwarded ? extracted.name : null,
    is_forwarded: extracted.isForwarded,
    processed_at: now,
  }
  if (decision.action === 'link') {
    status = 'linked'
    Object.assign(update, {
      link_status: status,
      customer_id: decision.customerId,
      customer_contact_id: decision.matchedOn === 'contact' ? contactIdByCustomer.get(decision.customerId) ?? null : null,
      linked_by: 'auto',
      linked_at: now,
    })
    if (decision.matchedOn === 'thread') {
      const sc = threadCaseByCustomer.get(decision.customerId)
      if (sc) update.service_case_id = sc
    }
  } else if (classifyNoise(extracted.email, subject, bodyText, bodyHtml)) {
    status = 'ignored'
    Object.assign(update, { link_status: status, linked_by: 'auto-noise' })
  } else {
    status = 'unidentified'
    Object.assign(update, { link_status: status, linked_by: null })
  }

  // Betinget: kobles kun, hvis ingen andre (bruger/AI/tidligere kørsel) har koblet mailen i mellemtiden
  const { data: updated, error: updErr } = await admin
    .from('incoming_emails').update(update).eq('id', emailId).is('customer_id', null).select('id')
  if (updErr) {
    logger.error('autolink: opdatering fejlede', { entity: 'incoming_emails', entityId: emailId, error: updErr })
    return { emailId, status: 'unidentified', customerId: null, customerContactId: null, matchedOn: null, confidence: 'low' }
  }
  if (!updated?.length) {
    // Koblet af en anden mellem læsning og skrivning → ingen ændring, ingen audit
    return { emailId, status: 'linked', customerId: null, customerContactId: null, matchedOn: null, confidence: 'low' }
  }

  await audit(admin, emailId, subject, decision)
  logger.info('Email auto-link', {
    entity: 'incoming_emails',
    entityId: emailId,
    metadata: { action: decision.action, matchedOn: decision.action === 'none' ? null : decision.matchedOn, status, isForwarded: extracted.isForwarded },
  })

  if (decision.action === 'link') {
    return {
      emailId,
      status,
      customerId: decision.customerId,
      customerContactId: (update.customer_contact_id as string | null) ?? null,
      matchedOn: 'email',
      confidence: 'high',
    }
  }
  return {
    emailId,
    status,
    customerId: null,
    customerContactId: null,
    matchedOn: decision.action === 'suggest' && decision.matchedOn === 'domain' ? 'domain' : null,
    confidence: decision.action === 'suggest' ? 'medium' : 'low',
  }
}
