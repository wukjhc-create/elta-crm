/**
 * C1a — klassificér ÉN mail med samme kontekst som shadow-målingen (./inquiry-context). Server-modul (IKKE 'use server');
 * kaldes kun fra en gatet server-action med en service-role-klient. KUN SELECT — skriver aldrig noget.
 *
 * Henter præcis den delmængde classifyAll behøver: mailen, tidligere mails fra samme afsender/domæne/tråd, mail-AI'ens
 * historik for dem (leverandørværnet), kunder/kontakter med samme e-mail, aktive leverandører, parter, relevante sager og
 * om mailen er registreret som leverandørfaktura. Resultatet er identisk med shadow-målingen for samme mail.
 */
import { classifyAll, type EmailRow, type ShadowData } from './inquiry-context'
import { caseNumbersInText, formEmail } from './inquiry-text-signals'
import { domainUsableAsEvidence, normalizeSender } from '@/lib/email/supplier-senders'
import { isWebsiteInquiry, normalizeFormSubmitTable } from '@/lib/mail/website-inquiry'
import type { InquiryClassification } from './inquiry-classifier'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
type Res<T> = { data: T | null; error: { message: string } | null }

const EMAIL_COLS = 'id, received_at, to_email, sender_email, original_sender_email, is_forwarded, conversation_id, customer_id, linked_by, link_status, service_case_id'
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)
const INVOICE_NAME = /(faktura|invoice|kreditnota|credit.?note)/i

interface RawEmail {
  id: string; received_at: string; to_email: string | null; sender_email: string | null; original_sender_email: string | null
  is_forwarded: boolean | null; conversation_id: string | null; customer_id: string | null; linked_by: string | null
  link_status: string | null; service_case_id: string | null
  subject?: string | null; body_text?: string | null; body_html?: string | null; body_preview?: string | null
  has_attachments?: boolean | null; attachment_urls?: unknown
}

function toRow(e: RawEmail, withContent: boolean): EmailRow {
  const body = withContent
    ? (e.body_text?.trim() ? e.body_text : (e.body_html ?? '').replace(/<[^>]*>/g, ' ') || e.body_preview || '').slice(0, 6000)
    : null
  return {
    id: e.id, received_at: e.received_at, to_email: String(e.to_email ?? '').toLowerCase(), sender_email: e.sender_email,
    original_sender_email: e.original_sender_email, is_forwarded: e.is_forwarded, subject: withContent ? e.subject ?? null : null,
    body, has_attachments: withContent ? !!e.has_attachments : null,
    att_invoice: withContent ? INVOICE_NAME.test(JSON.stringify(e.attachment_urls ?? '')) : null,
    thread: e.conversation_id, customer_id: e.customer_id, linked_by: e.linked_by, link_status: e.link_status, service_case_id: e.service_case_id,
  }
}

async function chunked<T>(ids: string[], fn: (part: string[]) => Promise<Res<T[]>>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const r = await fn(ids.slice(i, i + 200))
    if (r.error) throw new Error(r.error.message)
    out.push(...(r.data ?? []))
  }
  return out
}

export type EmailClassificationResult =
  | { ok: true; classification: InquiryClassification }
  | { ok: false; error: string }

export async function loadEmailClassification(db: Db, emailId: string): Promise<EmailClassificationResult> {
  try {
    const t = (await db.from('incoming_emails')
      .select(`${EMAIL_COLS}, subject, body_text, body_html, body_preview, has_attachments, attachment_urls`)
      .eq('id', emailId).maybeSingle()) as Res<RawEmail>
    if (t.error) return { ok: false, error: 'Mailen kunne ikke læses' }
    if (!t.data) return { ok: false, error: 'Mailen findes ikke' }
    const target = toRow(t.data, true)
    const sender = normalizeSender(target.is_forwarded && target.original_sender_email ? target.original_sender_email : target.sender_email)
    const domain = sender ? sender.split('@')[1] : null
    const webForm = isWebsiteInquiry({ senderEmail: target.sender_email, subject: target.subject })
    const matchEmail = webForm ? formEmail(normalizeFormSubmitTable(target.body ?? '')) : sender

    // Tidligere mails: samme afsender (også som original afsender), samme domæne, samme tråd — kun før denne mail
    const earlier = new Map<string, EmailRow>()
    const addAll = (r: Res<RawEmail[]>) => { if (r.error) throw new Error(r.error.message); for (const e of r.data ?? []) if (e.id !== emailId) earlier.set(e.id, toRow(e, false)) }
    const before = (q: Db) => q.lt('received_at', target.received_at).order('received_at', { ascending: false })
    if (sender) {
      addAll(await before(db.from('incoming_emails').select(EMAIL_COLS).ilike('sender_email', esc(sender))).limit(200))
      addAll(await before(db.from('incoming_emails').select(EMAIL_COLS).ilike('original_sender_email', esc(sender))).limit(200))
    }
    if (domain && domainUsableAsEvidence(domain)) {
      addAll(await before(db.from('incoming_emails').select(EMAIL_COLS).ilike('sender_email', `%@${esc(domain)}`)).limit(300))
      addAll(await before(db.from('incoming_emails').select(EMAIL_COLS).ilike('original_sender_email', `%@${esc(domain)}`)).limit(300))
    }
    if (target.thread) addAll(await before(db.from('incoming_emails').select(EMAIL_COLS).eq('conversation_id', target.thread)).limit(200))
    const emails = [target, ...earlier.values()]

    const eil = await chunked<{ email_id: string; classification: string | null; created_at: string }>(emails.map((e) => e.id),
      (part) => db.from('email_intelligence_logs').select('email_id, classification, created_at').in('email_id', part).limit(2000))

    const customers: ShadowData['customers'] = []
    const contacts: ShadowData['contacts'] = []
    if (matchEmail) {
      const c = (await db.from('customers').select('id, email, tags, created_at').ilike('email', esc(matchEmail)).limit(50)) as Res<Array<{ id: string; email: string; tags: string[] | null; created_at: string }>>
      if (c.error) throw new Error(c.error.message)
      for (const r of c.data ?? []) if (!/@elta-crm\.local$/i.test(r.email)) customers.push({ id: r.id, email: r.email.trim().toLowerCase(), auto: (r.tags ?? []).includes('auto-email'), created_at: r.created_at })
      const k = (await db.from('customer_contacts').select('customer_id, email, created_at').ilike('email', esc(matchEmail)).limit(50)) as Res<Array<{ customer_id: string; email: string; created_at: string }>>
      if (k.error) throw new Error(k.error.message)
      for (const r of k.data ?? []) contacts.push({ customer_id: r.customer_id, email: r.email.trim().toLowerCase(), created_at: r.created_at })
    }

    const s = (await db.from('suppliers').select('contact_email, website').eq('is_active', true).limit(500)) as Res<Array<{ contact_email: string | null; website: string | null }>>
    if (s.error) throw new Error(s.error.message)

    const p = (await db.from('parties').select('id, customer_id, verified_emails, verified_domains').limit(2000)) as Res<Array<{ id: string; customer_id: string | null; verified_emails: string[] | null; verified_domains: string[] | null }>>
    if (p.error) throw new Error(p.error.message)
    const rels = await chunked<{ party_id: string; relationship: string }>((p.data ?? []).map((x) => x.id),
      (part) => db.from('party_relationships').select('party_id, relationship').eq('status', 'active').in('party_id', part))

    const customerIds = [...new Set([...customers.map((c) => c.id), ...contacts.map((c) => c.customer_id)])]
    const nrs = caseNumbersInText({ subject: target.subject, body: webForm ? normalizeFormSubmitTable(target.body ?? '') : target.body })
    const cases: ShadowData['cases'] = []
    const addCases = (r: Res<Array<{ id: string; case_number: string | null; customer_id: string | null; created_at: string; closed_at: string | null }>>) => {
      if (r.error) throw new Error(r.error.message)
      for (const c of r.data ?? []) if (!cases.some((x) => x.id === c.id)) cases.push({ id: c.id, nr: c.case_number?.toUpperCase() ?? null, customer_id: c.customer_id, created_at: c.created_at, closed_at: c.closed_at })
    }
    const caseCols = 'id, case_number, customer_id, created_at, closed_at'
    if (nrs.length) addCases(await db.from('service_cases').select(caseCols).in('case_number', nrs))
    if (customerIds.length) addCases(await db.from('service_cases').select(caseCols).in('customer_id', customerIds).limit(500))

    const inv = (await db.from('incoming_invoices').select('id').eq('source_email_id', emailId).limit(1)) as Res<Array<{ id: string }>>
    if (inv.error) throw new Error(inv.error.message)

    const data: ShadowData = {
      emails, customers, contacts,
      suppliers: (s.data ?? []).map((r) => ({ email: r.contact_email, website: r.website })),
      parties: (p.data ?? []).map((x) => ({ id: x.id, customer_id: x.customer_id, emails: x.verified_emails, domains: x.verified_domains,
        rels: rels.filter((r) => r.party_id === x.id).map((r) => r.relationship) })),
      cases,
      eil: eil.map((r) => ({ email_id: r.email_id, c: r.classification, at: r.created_at })),
      invoices: (inv.data ?? []).length ? [emailId] : [],
      stage_a: [],
    }
    const row = classifyAll(data, { onlyIds: [emailId] })[0]
    if (!row) return { ok: false, error: 'Mailen kunne ikke klassificeres' }
    return { ok: true, classification: row.result }
  } catch {
    return { ok: false, error: 'Klassifikationen kunne ikke beregnes (læsefejl) — intet er ændret' }
  }
}
