/**
 * K5 — automatisk kobling af synkede mails til kunder med sikker confidence-model (Henrik 2026-10-06).
 *
 * Tilstand (MAIL_AUTOLINK_MODE, Henrik 2026-10-30; default 'off' = uændret live-adfærd):
 *   off     → kun den eksisterende linkEmail() (som i dag)
 *   suggest → SKYGGE: K5-beslutningen beregnes server-side (admin-klient) FØR linkEmail() og skrives KUN som forslag i
 *             audit_logs (confidence + begrundelse). incoming_emails røres ikke; linkEmail() kører uændret bagefter, så
 *             brugere ser ingen forskel. Bruges til at evaluere K5 mod den faktiske kobling, før 'link' godkendes.
 *   link    → K5 erstatter linkEmail() (kræver særskilt godkendelse efter evaluering af suggest)
 * Det gamle MAIL_AUTOLINK_ENABLED='true' svarer til 'link'. Ukendt værdi → 'off' (fail-safe).
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
import { isFreeMailDomain, NON_CUSTOMER_SENDER_DOMAINS } from '@/lib/email/free-mail-domains'
import { extractOriginalSender, classifyNoise, linkEmail } from '@/lib/services/email-linker'
import { decideAutoLink, type AutoLinkDecision, type AutoLinkSignals } from '@/lib/mail/autolink-policy'
import { logger } from '@/lib/utils/logger'
import type { LinkResult, EmailLinkStatus } from '@/types/mail-bridge.types'

type Admin = ReturnType<typeof createAdminClient>

/** Afsender-domæner der aldrig matches som kunde: eget domæne og formular-relæet (kunden står i formularen) */
const CANDIDATE_LIMIT = 5

export type MailAutolinkMode = 'off' | 'suggest' | 'link'

export function mailAutolinkMode(env: Record<string, string | undefined> = process.env): MailAutolinkMode {
  const raw = (env.MAIL_AUTOLINK_MODE ?? '').trim().toLowerCase()
  if (raw === 'off' || raw === 'suggest' || raw === 'link') return raw
  if (raw) {
    logger.warn('autolink: ukendt MAIL_AUTOLINK_MODE — bruger off', { metadata: { value: raw.slice(0, 20) } })
    return 'off'
  }
  return env.MAIL_AUTOLINK_ENABLED === 'true' ? 'link' : 'off'
}

export function isAutoLinkEnabled(): boolean {
  return mailAutolinkMode() === 'link'
}

/** Sikkerhed for en K5-beslutning: præcis/samtale = høj, ét firmadomæne = middel, tvetydigt = lav */
export function autoLinkConfidence(decision: AutoLinkDecision): 'high' | 'medium' | 'low' {
  if (decision.action === 'link') return 'high'
  if (decision.action === 'suggest' && decision.matchedOn === 'domain') return 'medium'
  return 'low'
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
    // LG-11 (log-review 2026-10-19): ikke mailens emne (kan indeholde persondata) — mailen findes via entity_id
    entity_name: 'Indgående mail',
    action: linked ? 'email_auto_linked' : 'email_link_suggested',
    action_description: linked ? `Mail koblet automatisk (${decision.reason})` : `Forslag til manuel kobling (${decision.reason})`,
    metadata: linked
      ? { source: 'k5', mode: 'link', customer_id: decision.customerId, matched_on: decision.matchedOn, confidence: autoLinkConfidence(decision), reason: decision.reason }
      : { source: 'k5', mode: 'link', candidate_customer_ids: decision.candidateIds, matched_on: decision.matchedOn, confidence: autoLinkConfidence(decision), reason: decision.reason },
  })
  if (error) logger.error('autolink: audit-log fejlede', { entity: 'incoming_emails', entityId: emailId, error })
}

/**
 * SUGGEST (skygge): beregn K5-beslutningen og gem den som forslag i audit_logs. Skriver ALDRIG til incoming_emails og
 * kaster aldrig (fejl logges) — den eksisterende kobling kører uændret bagefter. Allerede koblede mails og mails der
 * allerede har et skygge-forslag springes over (backfill/genkørsel giver ikke dubletter).
 */
export async function suggestAutoLink(
  emailId: string,
  senderEmail: string,
  senderName: string | null,
  subject: string,
  bodyHtml: string | null,
  bodyText: string | null
): Promise<AutoLinkDecision | null> {
  try {
    const admin = createAdminClient()
    const { data: row, error: rowErr } = await admin
      .from('incoming_emails').select('customer_id, conversation_id').eq('id', emailId).maybeSingle()
    if (rowErr || !row) {
      logger.warn('autolink-forslag: mail ikke fundet', { entity: 'incoming_emails', entityId: emailId, error: rowErr })
      return null
    }
    if (row.customer_id) return null
    const { data: prior, error: priorErr } = await admin
      .from('audit_logs').select('id').eq('entity_type', 'incoming_email').eq('entity_id', emailId)
      .eq('action', 'email_link_suggested').contains('metadata', { mode: 'suggest' }).limit(1)
    if (priorErr) {
      logger.warn('autolink-forslag: dublet-tjek fejlede — springer over', { entity: 'incoming_emails', entityId: emailId, error: priorErr })
      return null
    }
    if (prior?.length) return null

    const extracted = extractOriginalSender(senderEmail, senderName, subject, bodyHtml, bodyText)
    const { signals } = await gatherAutoLinkSignals(admin, emailId, extracted.email, (row.conversation_id as string | null) ?? null)
    const decision = decideAutoLink(signals)
    if (decision.action === 'none') return decision
    const confidence = autoLinkConfidence(decision)
    const candidates = decision.action === 'link' ? [decision.customerId] : decision.candidateIds
    const { error } = await admin.from('audit_logs').insert({
      user_id: null,
      user_name: 'Mail-automatik',
      entity_type: 'incoming_email',
      entity_id: emailId,
      entity_name: 'Indgående mail',
      action: 'email_link_suggested',
      action_description: `Forslag (${confidence === 'high' ? 'høj' : confidence === 'medium' ? 'middel' : 'lav'} sikkerhed: ${decision.reason}) — ikke koblet`,
      metadata: {
        source: 'k5', mode: 'suggest', candidate_customer_ids: candidates, matched_on: decision.matchedOn,
        confidence, reason: decision.reason, would_auto_link: decision.action === 'link',
      },
    })
    if (error) logger.error('autolink-forslag: audit-log fejlede', { entity: 'incoming_emails', entityId: emailId, error })
    return decision
  } catch (e) {
    logger.error('autolink-forslag fejlede', { entity: 'incoming_emails', entityId: emailId, error: e })
    return null
  }
}

/** Orkestratorens ene indgang: vælger sti efter MAIL_AUTOLINK_MODE (off = præcis som før). */
export async function linkIncomingEmail(
  emailId: string,
  senderEmail: string,
  senderName: string | null,
  subject: string,
  bodyHtml: string | null,
  bodyText: string | null
): Promise<LinkResult> {
  const mode = mailAutolinkMode()
  if (mode === 'link') return autoLinkEmail(emailId, senderEmail, senderName, subject, bodyHtml, bodyText)
  if (mode === 'suggest') await suggestAutoLink(emailId, senderEmail, senderName, subject, bodyHtml, bodyText)
  return linkEmail(emailId, senderEmail, senderName, subject, bodyHtml, bodyText)
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
