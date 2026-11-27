/**
 * C2/C3 — indlæs alt der skal til for at identificere afsenderne af ÉN ELLER FLERE mails og foreslå kunde/sag.
 * Server-modul (IKKE 'use server'); kaldes kun fra gatede server-actions med service-role-klient. KUN SELECT.
 *
 * Bulk (arbejdskøen): ét register (kunder, kontakter, parter, relationer, medarbejdere, sager, leverandører) + få
 * mængde-forespørgsler for alle mails på én gang (tidligere mails fra samme afsender/domæne/tråd, mail-AI-historik,
 * fakturaregistrering, tilbud). Én mail = samme kode med én id (paritet mellem kø og mailvisning).
 *
 * Klassifikationen (C1) beregnes med den fælles kontekst-kerne (classifyAll) — samme regler som shadow/C1a.
 * Kandidater beregnes over hele registret; den kaldende action filtrerer ALT med brugerens egen klient før visning (D5).
 * Skalering: registret hentes med fetchAllRows (i dag ~130 kunder/8 sager i prod); vokser det markant, flyttes
 * navne-/telefonopslag til en SQL-funktion (egen migration).
 */
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { domainUsableAsEvidence, normalizeSender } from '@/lib/email/supplier-senders'
import { isAutomatedSender } from '@/lib/parties/communication-class'
import { isWebsiteInquiry, normalizeFormSubmitTable } from '@/lib/mail/website-inquiry'
import { parseCustomerFromEmail } from '@/lib/utils/email-parser'
import { classifyAll, type EmailRow, type ShadowData } from '@/lib/classification/inquiry-context'
import type { InquiryClassification } from '@/lib/classification/inquiry-classifier'
import { extractIdentitySignals, type ExtractedIdentitySignals } from './identity-signals'
import { identifySender, type IdContact, type IdCustomer, type IdEmployee, type IdParty, type SenderIdentity } from './identity'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
type Row = Record<string, unknown>

const HUMAN_LINKS = ['manual', 'manual-create']
const isElta = (d: string | null) => !!d && (d === 'eltasolar.dk' || d.endsWith('.eltasolar.dk'))
const s = (v: unknown) => (v == null ? null : String(v))
const INVOICE_NAME = /(faktura|invoice|kreditnota|credit.?note)/i

export interface CoordinatorEmail {
  id: string; subject: string | null; receivedAt: string; senderEmail: string | null; senderName: string | null
  effectiveSender: string | null; isForwarded: boolean; threadId: string | null; customerId: string | null; linkedBy: string | null
  linkStatus: string | null; serviceCaseId: string | null; isArchived: boolean; isRead: boolean; toEmail: string | null; webForm: boolean
}
export interface CoordinatorCase {
  id: string; caseNumber: string; customerId: string | null; title: string | null; status: string; createdAt: string
  updatedAt: string; closedAt: string | null; isProposal: boolean
}
export interface CoordinatorOffer { id: string; offerNumber: string; customerId: string | null; status: string }
export interface CoordinatorContext {
  email: CoordinatorEmail
  classification: InquiryClassification | null
  identity: SenderIdentity
  signals: ExtractedIdentitySignals
  form: { name: string | null; email: string | null; phone: string | null; address: string | null; postalCode: string | null; city: string | null } | null
  /** Sager for kandidat-kunderne + sager nævnt i mailen + sager i samme tråd */
  cases: CoordinatorCase[]
  offers: CoordinatorOffer[]
  threadCaseIds: string[]
  /** Svar sendt fra ELTA i samme tråd efter mailen (Outlook eller CRM) — D3 */
  answeredAt: string | null
  customersById: Record<string, { id: string; name: string; customerNumber: string | null; email: string | null; phone: string | null; address: string | null; autoCreated: boolean }>
}

export type LoadResult = { ok: true; ctx: CoordinatorContext } | { ok: false; error: string }

export interface Registry {
  customers: Row[]; contacts: Row[]; partiesRaw: Row[]; rels: Row[]; profiles: Row[]; cases: Row[]
  suppliers: Array<{ contact_email: string | null; website: string | null }>
  own: { company_phone: string | null; company_vat_number: string | null } | undefined
}

/** Registret — indlæses én gang pr. kald (liste eller enkelt mail) */
export async function loadRegistry(db: Db): Promise<Registry> {
  const [customers, contacts, partiesRaw, rels, profiles, cases, suppliers, company] = await Promise.all([
    fetchAllRows<Row>((a, b) => db.from('customers').select('id, customer_number, company_name, contact_person, email, phone, mobile, vat_number, billing_address, billing_postal_code, billing_city, tags, created_at, is_active').order('id').range(a, b), 20_000),
    fetchAllRows<Row>((a, b) => db.from('customer_contacts').select('id, customer_id, name, email, phone, mobile, created_at').order('id').range(a, b), 50_000),
    fetchAllRows<Row>((a, b) => db.from('parties').select('id, kind, display_name, customer_id, supplier_id, profile_id, verified_emails, verified_domains, vat_number').order('id').range(a, b), 20_000),
    fetchAllRows<Row>((a, b) => db.from('party_relationships').select('id, party_id, relationship').eq('status', 'active').order('id').range(a, b), 50_000),
    fetchAllRows<Row>((a, b) => db.from('profiles').select('id, email, full_name, is_active').order('id').range(a, b), 5_000),
    fetchAllRows<Row>((a, b) => db.from('service_cases').select('id, case_number, customer_id, title, status, created_at, updated_at, closed_at, is_proposal').order('id').range(a, b), 50_000),
    db.from('suppliers').select('contact_email, website').eq('is_active', true).limit(1000),
    db.from('company_settings').select('company_phone, company_vat_number').limit(1),
  ])
  return { customers, contacts, partiesRaw, rels, profiles, cases, suppliers: (suppliers.data ?? []) as Registry['suppliers'], own: ((company.data ?? []) as Registry['own'][])[0] }
}

const EMAIL_COLS = 'id, received_at, to_email, sender_email, sender_name, original_sender_email, original_sender_name, is_forwarded, conversation_id, customer_id, linked_by, link_status, service_case_id, is_archived, is_read'
const CONTENT_COLS = 'subject, body_text, body_html, body_preview, has_attachments, attachment_urls'

async function chunkedIn(db: Db, table: string, cols: string, col: string, values: string[], extra?: (q: Db) => Db): Promise<Row[]> {
  const out: Row[] = []
  for (let i = 0; i < values.length; i += 150) {
    let q = db.from(table).select(cols).in(col, values.slice(i, i + 150))
    if (extra) q = extra(q)
    const r = await q.limit(5000)
    if (r.error) throw new Error(r.error.message)
    out.push(...((r.data ?? []) as Row[]))
  }
  return out
}

function toEmailRow(e: Row, withContent: boolean): EmailRow {
  const body = withContent ? bodyOf(e).slice(0, 6000) : null
  return {
    id: String(e.id), received_at: String(e.received_at), to_email: String(e.to_email ?? '').toLowerCase(), sender_email: s(e.sender_email),
    original_sender_email: s(e.original_sender_email), is_forwarded: !!e.is_forwarded, subject: withContent ? s(e.subject) : null, body,
    has_attachments: withContent ? !!e.has_attachments : null, att_invoice: withContent ? INVOICE_NAME.test(JSON.stringify(e.attachment_urls ?? '')) : null,
    thread: s(e.conversation_id), customer_id: s(e.customer_id), linked_by: s(e.linked_by), link_status: s(e.link_status), service_case_id: s(e.service_case_id),
  }
}
function bodyOf(e: Row): string {
  const t = s(e.body_text)
  return t && t.trim() ? t : (s(e.body_html) ?? '').replace(/<[^>]*>/g, ' ') || s(e.body_preview) || ''
}

/** Bulk: kontekst for flere mails. Mails der ikke findes, mangler i resultatet. */
export async function loadCoordinatorContexts(db: Db, emailIds: string[], registry?: Registry): Promise<Map<string, CoordinatorContext>> {
  const out = new Map<string, CoordinatorContext>()
  if (!emailIds.length) return out
  const reg = registry ?? await loadRegistry(db)
  const targets = await chunkedIn(db, 'incoming_emails', `${EMAIL_COLS}, ${CONTENT_COLS}`, 'id', emailIds)
  if (!targets.length) return out

  // Afsendere, domæner og tråde for de mails vi skal vurdere
  const effOf = (e: Row) => normalizeSender(e.is_forwarded && e.original_sender_email ? s(e.original_sender_email) : s(e.sender_email))
  const rawSenders = new Set<string>(), domains = new Set<string>(), threads = new Set<string>()
  for (const e of targets) {
    for (const v of [s(e.sender_email), s(e.original_sender_email)]) if (v) rawSenders.add(v)
    const eff = effOf(e); const d = eff?.split('@')[1] ?? null
    if (d && domainUsableAsEvidence(d)) domains.add(d)
    if (e.conversation_id) threads.add(String(e.conversation_id))
  }
  // Tidligere/relaterede mails (uden indhold): samme afsender, samme domæne, samme tråd
  const related = new Map<string, Row>()
  const addRows = (rows: Row[]) => { for (const r of rows) if (!related.has(String(r.id))) related.set(String(r.id), r) }
  addRows(await chunkedIn(db, 'incoming_emails', EMAIL_COLS, 'sender_email', [...rawSenders]))
  addRows(await chunkedIn(db, 'incoming_emails', EMAIL_COLS, 'original_sender_email', [...rawSenders]))
  addRows(await chunkedIn(db, 'incoming_emails', EMAIL_COLS, 'conversation_id', [...threads]))
  const dl = [...domains]
  for (let i = 0; i < dl.length; i += 15) {
    const ors = dl.slice(i, i + 15).flatMap((d) => [`sender_email.ilike.*@${d}`, `original_sender_email.ilike.*@${d}`]).join(',')
    const r = await db.from('incoming_emails').select(EMAIL_COLS).or(ors).order('received_at', { ascending: false }).limit(2000)
    if (r.error) throw new Error(r.error.message)
    addRows((r.data ?? []) as Row[])
  }
  const targetIds = new Set(targets.map((t) => String(t.id)))
  const allEmailRows: EmailRow[] = [...targets.map((t) => toEmailRow(t, true)), ...[...related.values()].filter((r) => !targetIds.has(String(r.id))).map((r) => toEmailRow(r, false))]
  const eil = await chunkedIn(db, 'email_intelligence_logs', 'email_id, classification, created_at', 'email_id', allEmailRows.map((e) => e.id))
  const inv = await chunkedIn(db, 'incoming_invoices', 'source_email_id', 'source_email_id', [...targetIds])

  // Register → typer
  const relsByParty = new Map<string, string[]>()
  for (const r of reg.rels) { const k = String(r.party_id); relsByParty.set(k, [...(relsByParty.get(k) ?? []), String(r.relationship)]) }
  const parties: IdParty[] = reg.partiesRaw.map((p) => ({ id: String(p.id), name: String(p.display_name), kind: p.kind === 'person' ? 'person' : 'organisation',
    customerId: s(p.customer_id), supplierId: s(p.supplier_id), profileId: s(p.profile_id), verifiedEmails: (p.verified_emails as string[] | null) ?? [],
    verifiedDomains: (p.verified_domains as string[] | null) ?? [], vat: s(p.vat_number), relationships: relsByParty.get(String(p.id)) ?? [] }))
  const placeholder = (e: string | null) => !!e && /@elta-crm\.local$/i.test(e)
  const autoOf = (c: Row) => ((c.tags as string[] | null) ?? []).includes('auto-email') || placeholder(s(c.email))
  const activeCustomers = reg.customers.filter((c) => c.is_active !== false)
  const idCustomers: IdCustomer[] = activeCustomers.flatMap((c) => {
    const base = { id: String(c.id), name: s(c.company_name), email: placeholder(s(c.email)) ? null : s(c.email), vat: s(c.vat_number),
      address: [s(c.billing_address), s(c.billing_postal_code), s(c.billing_city)].filter(Boolean).join(' ') || null, autoCreated: autoOf(c), createdAt: String(c.created_at), contactPerson: s(c.contact_person) }
    return [{ ...base, phone: s(c.phone) }, ...(c.mobile && c.mobile !== c.phone ? [{ ...base, phone: s(c.mobile) }] : [])]
  })
  const idContacts: IdContact[] = reg.contacts.flatMap((k) => {
    const base = { id: String(k.id), customerId: String(k.customer_id), name: s(k.name), email: s(k.email), createdAt: String(k.created_at) }
    return [{ ...base, phone: s(k.phone) }, ...(k.mobile && k.mobile !== k.phone ? [{ ...base, phone: s(k.mobile) }] : [])]
  })
  const employees: IdEmployee[] = reg.profiles.filter((p) => p.is_active !== false && p.email).map((p) => ({ profileId: String(p.id), email: String(p.email).toLowerCase(), name: s(p.full_name) }))
  const casesAll: CoordinatorCase[] = reg.cases.map((c) => ({ id: String(c.id), caseNumber: String(c.case_number), customerId: s(c.customer_id), title: s(c.title), status: String(c.status),
    createdAt: String(c.created_at), updatedAt: String(c.updated_at), closedAt: s(c.closed_at), isProposal: !!c.is_proposal }))
  const caseByNr = new Map(casesAll.map((c) => [c.caseNumber.toUpperCase(), c]))
  const caseById = new Map(casesAll.map((c) => [c.id, c]))

  // C1-klassifikation (fælles kerne, kontekst som på modtagelsestidspunktet)
  const shadow: ShadowData = {
    emails: allEmailRows,
    customers: reg.customers.filter((c) => s(c.email) && !placeholder(s(c.email))).map((c) => ({ id: String(c.id), email: String(c.email).trim().toLowerCase(), auto: ((c.tags as string[] | null) ?? []).includes('auto-email'), created_at: String(c.created_at) })),
    contacts: reg.contacts.filter((k) => s(k.email)).map((k) => ({ customer_id: String(k.customer_id), email: String(k.email).trim().toLowerCase(), created_at: String(k.created_at) })),
    suppliers: reg.suppliers.map((x) => ({ email: x.contact_email, website: x.website })),
    parties: parties.map((p) => ({ id: p.id, customer_id: p.customerId, emails: p.verifiedEmails, domains: p.verifiedDomains, rels: p.relationships })),
    cases: casesAll.map((c) => ({ id: c.id, nr: c.caseNumber.toUpperCase(), customer_id: c.customerId, created_at: c.createdAt, closed_at: c.closedAt })),
    eil: eil.map((r) => ({ email_id: String(r.email_id), c: s(r.classification), at: String(r.created_at) })),
    invoices: inv.map((r) => String(r.source_email_id)),
    stage_a: [],
  }
  const classByEmail = new Map(classifyAll(shadow, { onlyIds: [...targetIds] }).map((r) => [r.emailId, r.result]))

  // Tilbud nævnt i mails
  const perTarget = targets.map((e) => {
    const body = bodyOf(e)
    const isForwarded = !!e.is_forwarded
    return { e, body, isForwarded, signals: extractIdentitySignals({ subject: s(e.subject), body, forwarded: isForwarded }, { phones: [reg.own?.company_phone], vats: [reg.own?.company_vat_number] }) }
  })
  const offerNrs = [...new Set(perTarget.flatMap((t) => t.signals.offerNumbers))]
  const offerRows = offerNrs.length ? await chunkedIn(db, 'offers', 'id, offer_number, customer_id, status', 'offer_number', offerNrs) : []
  const offersByNr = new Map(offerRows.map((o) => [String(o.offer_number), { id: String(o.id), offerNumber: String(o.offer_number), customerId: s(o.customer_id), status: String(o.status) }]))
  const relatedRows = [...related.values()]
  const customerRow = new Map(reg.customers.map((c) => [String(c.id), c]))

  for (const { e, body, isForwarded, signals } of perTarget) {
    const id = String(e.id)
    const receivedAt = String(e.received_at)
    const at = Date.parse(receivedAt)
    const original = normalizeSender(s(e.original_sender_email))
    const effective = isForwarded ? original : normalizeSender(s(e.sender_email))
    const webForm = isWebsiteInquiry({ senderEmail: s(e.sender_email), subject: s(e.subject) })
    const parsed = webForm ? parseCustomerFromEmail(normalizeFormSubmitTable(body), null, null) : null
    const form = parsed ? { name: parsed.name ?? parsed.contactPerson, email: parsed.email?.toLowerCase() ?? null, phone: parsed.phone, address: parsed.address, postalCode: parsed.postalCode, city: parsed.city } : null
    const threadId = s(e.conversation_id)
    const threadRows = threadId ? relatedRows.filter((r) => s(r.conversation_id) === threadId && String(r.id) !== id) : []
    const earlierThread = threadRows.filter((r) => Date.parse(String(r.received_at)) < at)
    const threadHumanCustomerIds = [...new Set(earlierThread.filter((r) => r.customer_id && HUMAN_LINKS.includes(String(r.linked_by))).map((r) => String(r.customer_id)))]
    const threadCaseIds = [...new Set(earlierThread.filter((r) => r.service_case_id).map((r) => String(r.service_case_id)))]
    const answered = threadRows.filter((r) => !r.is_forwarded && isElta(normalizeSender(s(r.sender_email))?.split('@')[1] ?? null) && Date.parse(String(r.received_at)) > at)
      .sort((a, b) => Date.parse(String(a.received_at)) - Date.parse(String(b.received_at)))[0]
    const previousManualCustomerIds = effective ? [...new Set(relatedRows.filter((r) => String(r.id) !== id && Date.parse(String(r.received_at)) < at && r.customer_id
      && HUMAN_LINKS.includes(String(r.linked_by)) && effOf(r) === effective).map((r) => String(r.customer_id)))] : []
    const mentioned = signals.caseNumbers.map((n) => caseByNr.get(n.toUpperCase())).filter((c): c is CoordinatorCase => !!c)
    const classification = classByEmail.get(id) ?? null
    const identity = identifySender({
      senderEmail: effective, senderName: isForwarded ? s(e.original_sender_name) : s(e.sender_name),
      forwarded: { isForwarded, forwarderEmail: isForwarded ? normalizeSender(s(e.sender_email)) : null, originalKnown: !isForwarded || !!original },
      webForm: form ? { email: form.email, phone: form.phone, name: form.name, address: [form.address, form.postalCode, form.city].filter(Boolean).join(' ') || null } : null,
      textPhones: signals.phones, textVats: signals.vats,
      supplier: { isSupplier: classification?.senderType === 'supplier', reasons: (classification?.rules ?? []).filter((r) => r.dimension === 'sender').map((r) => r.rule) },
      automated: isAutomatedSender(effective) || classification?.senderType === 'automated', internalDomain: isElta(effective?.split('@')[1] ?? null),
      threadHumanCustomerIds, previousManualCustomerIds, customers: idCustomers, contacts: idContacts, parties, employees,
      caseReferenceCustomerIds: [...new Set(mentioned.map((c) => c.customerId).filter((x): x is string => !!x))], receivedAt,
    })
    const candIds = [...new Set([identity.primary, ...identity.alternatives].filter((c) => c && c.customerId && !c.domainOnly).map((c) => c!.customerId as string))]
    const linkedCustomer = s(e.customer_id)
    if (linkedCustomer && !candIds.includes(linkedCustomer)) candIds.push(linkedCustomer)
    const cases = new Map<string, CoordinatorCase>()
    for (const c of mentioned) cases.set(c.id, c)
    for (const c of casesAll) if (c.customerId && candIds.includes(c.customerId)) cases.set(c.id, c)
    for (const cid of threadCaseIds) { const c = caseById.get(cid); if (c) cases.set(c.id, c) }
    const linkedCase = s(e.service_case_id); if (linkedCase) { const c = caseById.get(linkedCase); if (c) cases.set(c.id, c) }
    const offers = signals.offerNumbers.map((n) => offersByNr.get(n)).filter((o): o is CoordinatorOffer => !!o)
    const wanted = new Set([...candIds, ...[...cases.values()].map((c) => c.customerId).filter((x): x is string => !!x), ...offers.map((o) => o.customerId).filter((x): x is string => !!x)])
    const customersById: CoordinatorContext['customersById'] = {}
    for (const cid of wanted) { const c = customerRow.get(cid); if (c) customersById[cid] = { id: cid, name: String(c.company_name ?? 'Kunde'), customerNumber: s(c.customer_number),
      email: placeholder(s(c.email)) ? null : s(c.email), phone: s(c.phone) ?? s(c.mobile), address: [s(c.billing_address), s(c.billing_postal_code), s(c.billing_city)].filter(Boolean).join(', ') || null, autoCreated: autoOf(c) } }
    out.set(id, {
      email: { id, subject: s(e.subject), receivedAt, senderEmail: normalizeSender(s(e.sender_email)), senderName: s(e.sender_name), effectiveSender: effective,
        isForwarded, threadId, customerId: linkedCustomer, linkedBy: s(e.linked_by), linkStatus: s(e.link_status), serviceCaseId: linkedCase,
        isArchived: !!e.is_archived, isRead: !!e.is_read, toEmail: s(e.to_email), webForm },
      classification, identity, signals, form, cases: [...cases.values()], offers, threadCaseIds, answeredAt: answered ? String(answered.received_at) : null, customersById,
    })
  }
  return out
}

/** Én mail (mailvisningen / handlinger) — samme kode som bulk */
export async function loadCoordinatorContext(db: Db, emailId: string, registry?: Registry): Promise<LoadResult> {
  try {
    const m = await loadCoordinatorContexts(db, [emailId], registry)
    const ctx = m.get(emailId)
    return ctx ? { ok: true, ctx } : { ok: false, error: 'Mailen findes ikke' }
  } catch {
    return { ok: false, error: 'Forslag kunne ikke beregnes (læsefejl) — intet er ændret' }
  }
}
