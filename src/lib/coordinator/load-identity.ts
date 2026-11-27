/**
 * C2/C3 — indlæs alt der skal til for at identificere afsenderen af ÉN mail og foreslå kunde/sag. Server-modul (IKKE
 * 'use server'); kaldes kun fra en gatet server-action med service-role-klient. KUN SELECT — skriver aldrig.
 *
 * Kandidater beregnes over hele registret (service-role), men den kaldende action filtrerer ALT med brugerens egen klient
 * før visning (D5 i PHASE_C_DEVLOG.md): en kandidat/sag brugeren ikke selv kan læse, vises aldrig.
 * Skalering: kunder/kontakter hentes med fetchAllRows (i dag ~130 kunder); bliver registret stort, flyttes navne-/telefon-
 * opslag til en SQL-funktion (egen migration).
 */
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { normalizeSender } from '@/lib/email/supplier-senders'
import { isAutomatedSender } from '@/lib/parties/communication-class'
import { isWebsiteInquiry, normalizeFormSubmitTable } from '@/lib/mail/website-inquiry'
import { parseCustomerFromEmail } from '@/lib/utils/email-parser'
import { loadEmailClassification } from '@/lib/classification/load-email-classification'
import type { InquiryClassification } from '@/lib/classification/inquiry-classifier'
import { extractIdentitySignals, type ExtractedIdentitySignals } from './identity-signals'
import { identifySender, type IdContact, type IdCustomer, type IdEmployee, type IdParty, type SenderIdentity } from './identity'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const HUMAN_LINKS = ['manual', 'manual-create']
const isElta = (d: string | null) => !!d && (d === 'eltasolar.dk' || d.endsWith('.eltasolar.dk'))

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

const EMAIL_COLS = 'id, subject, received_at, sender_email, sender_name, original_sender_email, original_sender_name, is_forwarded, conversation_id, customer_id, linked_by, link_status, service_case_id, is_archived, is_read, to_email, body_text, body_html, body_preview'

export interface Registry {
  customers: Array<Record<string, unknown>>; contacts: Array<Record<string, unknown>>; partiesRaw: Array<Record<string, unknown>>
  rels: Array<Record<string, unknown>>; profiles: Array<Record<string, unknown>>; own: { company_phone: string | null; company_vat_number: string | null } | undefined
}

/** Registret (kunder, kontakter, parter, relationer, medarbejdere, ELTA's egne numre) — indlæses én gang pr. liste */
export async function loadRegistry(db: Db): Promise<Registry> {
  const [customers, contacts, partiesRaw, rels, profiles, company] = await Promise.all([
    fetchAllRows<Record<string, unknown>>((a, b) => db.from('customers').select('id, customer_number, company_name, contact_person, email, phone, mobile, vat_number, billing_address, billing_postal_code, billing_city, tags, created_at, is_active').order('id').range(a, b), 20_000),
    fetchAllRows<Record<string, unknown>>((a, b) => db.from('customer_contacts').select('id, customer_id, name, email, phone, mobile, created_at').order('id').range(a, b), 50_000),
    fetchAllRows<Record<string, unknown>>((a, b) => db.from('parties').select('id, kind, display_name, customer_id, supplier_id, profile_id, verified_emails, verified_domains, vat_number').order('id').range(a, b), 20_000),
    fetchAllRows<Record<string, unknown>>((a, b) => db.from('party_relationships').select('id, party_id, relationship').eq('status', 'active').order('id').range(a, b), 50_000),
    fetchAllRows<Record<string, unknown>>((a, b) => db.from('profiles').select('id, email, full_name, is_active').order('id').range(a, b), 5_000),
    db.from('company_settings').select('company_phone, company_vat_number').limit(1),
  ])
  return { customers, contacts, partiesRaw, rels, profiles, own: ((company.data ?? []) as Registry['own'][])[0] }
}

export async function loadCoordinatorContext(db: Db, emailId: string, registry?: Registry): Promise<LoadResult> {
  try {
    const t = await db.from('incoming_emails').select(EMAIL_COLS).eq('id', emailId).maybeSingle()
    if (t.error) return { ok: false, error: 'Mailen kunne ikke læses' }
    if (!t.data) return { ok: false, error: 'Mailen findes ikke' }
    const e = t.data as Record<string, unknown>
    const str = (k: string) => (e[k] == null ? null : String(e[k]))
    const body = str('body_text')?.trim() ? str('body_text') : (str('body_html') ?? '').replace(/<[^>]*>/g, ' ') || str('body_preview') || ''
    const isForwarded = !!e.is_forwarded
    const original = normalizeSender(str('original_sender_email'))
    const effective = isForwarded ? original : normalizeSender(str('sender_email'))
    const webForm = isWebsiteInquiry({ senderEmail: str('sender_email'), subject: str('subject') })
    const parsed = webForm ? parseCustomerFromEmail(normalizeFormSubmitTable(body ?? ''), null, null) : null
    const form = parsed ? { name: parsed.name ?? parsed.contactPerson, email: parsed.email?.toLowerCase() ?? null, phone: parsed.phone, address: parsed.address, postalCode: parsed.postalCode, city: parsed.city } : null

    const reg = registry ?? await loadRegistry(db)
    const { customers, contacts, partiesRaw, rels, profiles, own } = reg
    const signals = extractIdentitySignals({ subject: str('subject'), body, forwarded: isForwarded }, { phones: [own?.company_phone], vats: [own?.company_vat_number] })

    const s = (v: unknown) => (v == null ? null : String(v))
    const idCustomers: IdCustomer[] = customers.filter((c) => c.is_active !== false).flatMap((c) => {
      const base = { id: String(c.id), name: s(c.company_name), email: s(c.email), vat: s(c.vat_number), address: [s(c.billing_address), s(c.billing_postal_code), s(c.billing_city)].filter(Boolean).join(' ') || null,
        autoCreated: ((c.tags as string[] | null) ?? []).includes('auto-email') || /@elta-crm\.local$/i.test(String(c.email ?? '')), createdAt: String(c.created_at), contactPerson: s(c.contact_person) }
      // Pladsholder-e-mails (auto+…@elta-crm.local) matcher aldrig
      const email = base.email && /@elta-crm\.local$/i.test(base.email) ? null : base.email
      return [{ ...base, email, phone: s(c.phone) }, ...(c.mobile && c.mobile !== c.phone ? [{ ...base, email, phone: s(c.mobile) }] : [])]
    })
    // Én kunde kan have to telefonnumre → slå sammen pr. id efter identifikation (identifySender dedupliker på nøgle c:id)
    const idContacts: IdContact[] = contacts.flatMap((k) => {
      const base = { id: String(k.id), customerId: String(k.customer_id), name: s(k.name), email: s(k.email), createdAt: String(k.created_at) }
      return [{ ...base, phone: s(k.phone) }, ...(k.mobile && k.mobile !== k.phone ? [{ ...base, phone: s(k.mobile) }] : [])]
    })
    const relsByParty = new Map<string, string[]>()
    for (const r of rels) { const k = String(r.party_id); relsByParty.set(k, [...(relsByParty.get(k) ?? []), String(r.relationship)]) }
    const parties: IdParty[] = partiesRaw.map((p) => ({ id: String(p.id), name: String(p.display_name), kind: p.kind === 'person' ? 'person' : 'organisation',
      customerId: s(p.customer_id), supplierId: s(p.supplier_id), profileId: s(p.profile_id), verifiedEmails: (p.verified_emails as string[] | null) ?? [],
      verifiedDomains: (p.verified_domains as string[] | null) ?? [], vat: s(p.vat_number), relationships: relsByParty.get(String(p.id)) ?? [] }))
    const employees: IdEmployee[] = profiles.filter((p) => p.is_active !== false && p.email).map((p) => ({ profileId: String(p.id), email: String(p.email).toLowerCase(), name: s(p.full_name) }))

    // Tråd og tidligere manuelle koblinger (kun mails FØR denne)
    const receivedAt = String(e.received_at)
    const threadId = str('conversation_id')
    const thread = threadId ? await db.from('incoming_emails').select('id, received_at, sender_email, customer_id, linked_by, service_case_id').eq('conversation_id', threadId).neq('id', emailId).limit(300) : { data: [] }
    const threadRows = (thread.data ?? []) as Array<{ id: string; received_at: string; sender_email: string | null; customer_id: string | null; linked_by: string | null; service_case_id: string | null }>
    const earlierThread = threadRows.filter((r) => Date.parse(r.received_at) < Date.parse(receivedAt))
    const threadHumanCustomerIds = [...new Set(earlierThread.filter((r) => r.customer_id && HUMAN_LINKS.includes(String(r.linked_by))).map((r) => r.customer_id as string))]
    const threadCaseIds = [...new Set(earlierThread.filter((r) => r.service_case_id).map((r) => r.service_case_id as string))]
    const answered = threadRows.filter((r) => isElta(normalizeSender(r.sender_email)?.split('@')[1] ?? null) && Date.parse(r.received_at) > Date.parse(receivedAt))
      .sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at))[0]
    let previousManualCustomerIds: string[] = []
    if (effective) {
      const prev = await db.from('incoming_emails').select('customer_id').ilike(isForwarded ? 'original_sender_email' : 'sender_email', effective.replace(/[\\%_]/g, (c) => `\\${c}`))
        .in('linked_by', HUMAN_LINKS).lt('received_at', receivedAt).not('customer_id', 'is', null).limit(50)
      previousManualCustomerIds = [...new Set(((prev.data ?? []) as Array<{ customer_id: string }>).map((r) => r.customer_id))]
    }

    // Sager nævnt i mailen
    const caseCols = 'id, case_number, customer_id, title, status, created_at, updated_at, closed_at, is_proposal'
    const mentioned = signals.caseNumbers.length ? await db.from('service_cases').select(caseCols).in('case_number', signals.caseNumbers) : { data: [] }
    const mentionedRows = (mentioned.data ?? []) as Array<Record<string, unknown>>
    const caseReferenceCustomerIds = [...new Set(mentionedRows.map((c) => s(c.customer_id)).filter((x): x is string => !!x))]

    const classificationRes = await loadEmailClassification(db, emailId)
    const classification = classificationRes.ok ? classificationRes.classification : null
    const supplier = { isSupplier: classification?.senderType === 'supplier', reasons: (classification?.rules ?? []).filter((r) => r.dimension === 'sender').map((r) => r.rule) }

    const identity = identifySender({
      senderEmail: effective, senderName: isForwarded ? str('original_sender_name') : str('sender_name'),
      forwarded: { isForwarded, forwarderEmail: isForwarded ? normalizeSender(str('sender_email')) : null, originalKnown: !isForwarded || !!original },
      webForm: form ? { email: form.email, phone: form.phone, name: form.name, address: [form.address, form.postalCode, form.city].filter(Boolean).join(' ') || null } : null,
      textPhones: signals.phones, textVats: signals.vats, supplier, automated: isAutomatedSender(effective) || classification?.senderType === 'automated',
      internalDomain: isElta(effective?.split('@')[1] ?? null), threadHumanCustomerIds, previousManualCustomerIds,
      customers: idCustomers, contacts: idContacts, parties, employees, caseReferenceCustomerIds, receivedAt,
    })

    // Sager og tilbud for kandidaterne (primær + alternativer) + nævnte + tråd
    const candCustomerIds = [...new Set([identity.primary, ...identity.alternatives].filter((c) => c && c.customerId && !c.domainOnly).map((c) => c!.customerId as string))]
    const linkedCustomer = str('customer_id')
    if (linkedCustomer && !candCustomerIds.includes(linkedCustomer)) candCustomerIds.push(linkedCustomer)
    const caseRows: Array<Record<string, unknown>> = [...mentionedRows]
    if (candCustomerIds.length) {
      const r = await db.from('service_cases').select(caseCols).in('customer_id', candCustomerIds).order('updated_at', { ascending: false }).limit(200)
      caseRows.push(...((r.data ?? []) as Array<Record<string, unknown>>))
    }
    if (threadCaseIds.length) {
      const r = await db.from('service_cases').select(caseCols).in('id', threadCaseIds)
      caseRows.push(...((r.data ?? []) as Array<Record<string, unknown>>))
    }
    const cases = new Map<string, CoordinatorCase>()
    for (const c of caseRows) cases.set(String(c.id), { id: String(c.id), caseNumber: String(c.case_number), customerId: s(c.customer_id), title: s(c.title), status: String(c.status),
      createdAt: String(c.created_at), updatedAt: String(c.updated_at), closedAt: s(c.closed_at), isProposal: !!c.is_proposal })
    const offers: CoordinatorOffer[] = []
    if (signals.offerNumbers.length) {
      const r = await db.from('offers').select('id, offer_number, customer_id, status').in('offer_number', signals.offerNumbers)
      for (const o of (r.data ?? []) as Array<Record<string, unknown>>) offers.push({ id: String(o.id), offerNumber: String(o.offer_number), customerId: s(o.customer_id), status: String(o.status) })
    }

    const customersById: CoordinatorContext['customersById'] = {}
    const wanted = new Set([...candCustomerIds, ...[...cases.values()].map((c) => c.customerId).filter((x): x is string => !!x), ...offers.map((o) => o.customerId).filter((x): x is string => !!x)])
    for (const c of customers) if (wanted.has(String(c.id))) customersById[String(c.id)] = { id: String(c.id), name: String(c.company_name ?? 'Kunde'), customerNumber: s(c.customer_number),
      email: s(c.email), phone: s(c.phone) ?? s(c.mobile), address: [s(c.billing_address), s(c.billing_postal_code), s(c.billing_city)].filter(Boolean).join(', ') || null,
      autoCreated: ((c.tags as string[] | null) ?? []).includes('auto-email') }

    return {
      ok: true,
      ctx: {
        email: { id: String(e.id), subject: str('subject'), receivedAt, senderEmail: normalizeSender(str('sender_email')), senderName: str('sender_name'), effectiveSender: effective,
          isForwarded, threadId, customerId: linkedCustomer, linkedBy: str('linked_by'), linkStatus: str('link_status'), serviceCaseId: str('service_case_id'),
          isArchived: !!e.is_archived, isRead: !!e.is_read, toEmail: str('to_email'), webForm },
        classification, identity, signals, form, cases: [...cases.values()], offers, threadCaseIds, answeredAt: answered?.received_at ?? null, customersById,
      },
    }
  } catch {
    return { ok: false, error: 'Forslag kunne ikke beregnes (læsefejl) — intet er ændret' }
  }
}
