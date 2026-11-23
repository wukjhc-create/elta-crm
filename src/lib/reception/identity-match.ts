/**
 * AI-receptionist fase 2 — KANONISK deterministisk identitets-matcher. Bevidst IKKE 'use server'.
 *
 * Nøgler: telefon (kanonisk normaliseret), e-mail (normaliseret, pladsholdere ignoreres), kundenummer (eksakt),
 * kendt kontakt (id). ALDRIG navne og aldrig fuzzy.
 *
 * Udfald:
 *   unique_match              præcis én kunde (en KANDIDAT — telefon/mail autentificerer ikke afsenderen)
 *   ambiguous                 flere kunder, eller nøglerne peger på forskellige kunder
 *   no_match                  ingen kunde (evt. lead-kandidater, som aldrig konverteres automatisk)
 *   insufficient_information  ingen brugbar nøgle
 *   read_error                en læsning fejlede — bliver ALDRIG til no_match
 *
 * Kør loaderen med den indloggede brugers klient (RLS): brugeren/aktøren finder kun kunder i eget læse-scope.
 */
import { canonicalPhone } from '@/lib/utils/phone'
import type { IdentityState } from './contract'

export interface IdentityInput {
  phone?: string | null
  email?: string | null
  customerNumber?: string | null
  contactId?: string | null
}

export type MatchKey = 'phone' | 'email' | 'customer_number' | 'contact'

export interface IdentityCandidate {
  customerId: string
  via: MatchKey[]
  contactIds: string[]
}

export interface IdentityResult {
  state: IdentityState
  candidates: IdentityCandidate[]
  /** Leads med samme telefon — vises som kandidat-type 'lead', aldrig auto-konverteret */
  leadIds: string[]
  keysUsed: MatchKey[]
  /** Fejlkode ved read_error (ingen rå DB-tekst ud) */
  error: string | null
}

export interface CustomerRow { id: string; customer_number: string | null; email: string | null; phone: string | null; mobile: string | null }
export interface ContactRow { id: string; customer_id: string; email: string | null; phone: string | null; mobile: string | null }
export interface LeadRow { id: string; phone: string | null }

export interface IdentityRows {
  customers: CustomerRow[]
  contacts: ContactRow[]
  leads: LeadRow[]
}

const PLACEHOLDER_EMAIL = /@elta-crm\.local$/i

export function normalizeEmailKey(raw: string | null | undefined): string | null {
  const e = String(raw ?? '').trim().toLowerCase()
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null
  if (PLACEHOLDER_EMAIL.test(e)) return null
  return e
}

export function normalizeCustomerNumber(raw: string | null | undefined): string | null {
  const n = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
  return n.length >= 2 && n.length <= 32 ? n : null
}

export function usableKeys(input: IdentityInput): { phone: string | null; email: string | null; customerNumber: string | null; contactId: string | null; keys: MatchKey[] } {
  const phone = canonicalPhone(input.phone)
  const email = normalizeEmailKey(input.email)
  const customerNumber = normalizeCustomerNumber(input.customerNumber)
  const contactId = input.contactId && /^[0-9a-f-]{36}$/i.test(input.contactId) ? input.contactId : null
  const keys: MatchKey[] = []
  if (phone) keys.push('phone')
  if (email) keys.push('email')
  if (customerNumber) keys.push('customer_number')
  if (contactId) keys.push('contact')
  return { phone, email, customerNumber, contactId, keys }
}

/** Ren klassifikation over allerede læste rækker */
export function classifyIdentity(input: IdentityInput, rows: IdentityRows): IdentityResult {
  const k = usableKeys(input)
  if (!k.keys.length) return { state: 'insufficient_information', candidates: [], leadIds: [], keysUsed: [], error: null }

  const byCustomer = new Map<string, IdentityCandidate>()
  const add = (customerId: string, via: MatchKey, contactId?: string) => {
    const c = byCustomer.get(customerId) ?? { customerId, via: [], contactIds: [] }
    if (!c.via.includes(via)) c.via.push(via)
    if (contactId && !c.contactIds.includes(contactId)) c.contactIds.push(contactId)
    byCustomer.set(customerId, c)
  }
  /** Hvilke kunder hver nøgle peger på (til konflikt-tjek mellem nøgler) */
  const perKey = new Map<MatchKey, Set<string>>()
  const mark = (key: MatchKey, customerId: string) => { const s = perKey.get(key) ?? new Set<string>(); s.add(customerId); perKey.set(key, s) }

  for (const c of rows.customers) {
    if (k.phone && (canonicalPhone(c.phone) === k.phone || canonicalPhone(c.mobile) === k.phone)) { add(c.id, 'phone'); mark('phone', c.id) }
    if (k.email && normalizeEmailKey(c.email) === k.email) { add(c.id, 'email'); mark('email', c.id) }
    if (k.customerNumber && normalizeCustomerNumber(c.customer_number) === k.customerNumber) { add(c.id, 'customer_number'); mark('customer_number', c.id) }
  }
  for (const ct of rows.contacts) {
    if (k.contactId && ct.id === k.contactId) { add(ct.customer_id, 'contact', ct.id); mark('contact', ct.customer_id) }
    if (k.phone && (canonicalPhone(ct.phone) === k.phone || canonicalPhone(ct.mobile) === k.phone)) { add(ct.customer_id, 'phone', ct.id); mark('phone', ct.customer_id) }
    if (k.email && normalizeEmailKey(ct.email) === k.email) { add(ct.customer_id, 'email', ct.id); mark('email', ct.customer_id) }
  }
  const leadIds = k.phone ? rows.leads.filter((l) => canonicalPhone(l.phone) === k.phone).map((l) => l.id) : []

  const candidates = [...byCustomer.values()].sort((a, b) => a.customerId.localeCompare(b.customerId))
  // Kundenummer og kendt kontakt er stærkere end telefon/mail: peger de entydigt på én kunde, og peger telefon/mail på
  // en ANDEN kunde, er det en konflikt → ambiguous (aldrig "vælg den stærkeste" i stilhed).
  if (candidates.length === 0) return { state: 'no_match', candidates: [], leadIds, keysUsed: k.keys, error: null }
  if (candidates.length === 1) return { state: 'unique_match', candidates, leadIds, keysUsed: k.keys, error: null }
  return { state: 'ambiguous', candidates, leadIds, keysUsed: k.keys, error: null }
}

/**
 * Leverandør-/kunde-integritetsværn (2026-11-23, S2): en afsender der deterministisk er kendt som leverandør
 * (lib/email/supplier-senders) må ALDRIG blive kundekandidat — heller ikke når en (forurenet, auto-oprettet) kunderække har
 * samme e-mail. Resultatet er no_match; årsagen 'supplier_sender' lægges på henvendelsen som intern handoff-årsag.
 * "Findes i customers" er altså ikke bevis for en slutkunde, når leverandør-evidens findes.
 */
export const SUPPLIER_SENDER_REASON = 'supplier_sender' as const
export function supplierSenderIdentity(): IdentityResult {
  return { state: 'no_match', candidates: [], leadIds: [], keysUsed: [], error: null }
}

type Q = { data: unknown[] | null; error: { message: string } | null }

/**
 * Læs kandidat-rækker og klassificér. Enhver læsefejl → read_error (aldrig no_match).
 * Telefon kræver en scanning (numre er gemt i fri form); e-mail/kundenummer/kontakt slås op direkte.
 */
export async function matchIdentity(client: any, input: IdentityInput, opts: { scanLimit?: number } = {}): Promise<IdentityResult> {
  const k = usableKeys(input)
  if (!k.keys.length) return { state: 'insufficient_information', candidates: [], leadIds: [], keysUsed: [], error: null }
  const scanLimit = opts.scanLimit ?? 50_000
  try {
    const rows: IdentityRows = { customers: [], contacts: [], leads: [] }
    const take = (r: Q, what: string): unknown[] => { if (r.error) throw new Error(`read:${what}`); return r.data ?? [] }
    const custCols = 'id, customer_number, email, phone, mobile'
    const contactCols = 'id, customer_id, email, phone, mobile'
    if (k.phone) {
      const { fetchAllRows } = await import('@/lib/supabase/fetch-all')
      const wrap = async <T,>(what: string, f: () => Promise<T[]>) => { try { return await f() } catch { throw new Error(`read:${what}`) } }
      const [c, ct, l] = await Promise.all([
        wrap('customers', () => fetchAllRows<CustomerRow>((a, b) => client.from('customers').select(custCols).or('phone.not.is.null,mobile.not.is.null').order('id').range(a, b), scanLimit)),
        wrap('contacts', () => fetchAllRows<ContactRow>((a, b) => client.from('customer_contacts').select(contactCols).or('phone.not.is.null,mobile.not.is.null').order('id').range(a, b), scanLimit)),
        wrap('leads', () => fetchAllRows<LeadRow>((a, b) => client.from('leads').select('id, phone').not('phone', 'is', null).order('id').range(a, b), scanLimit)),
      ])
      rows.customers.push(...c); rows.contacts.push(...ct); rows.leads.push(...l)
    }
    if (k.email) {
      const [c, ct] = await Promise.all([
        client.from('customers').select(custCols).ilike('email', k.email).limit(50),
        client.from('customer_contacts').select(contactCols).ilike('email', k.email).limit(50),
      ])
      rows.customers.push(...(take(c, 'customers') as CustomerRow[])); rows.contacts.push(...(take(ct, 'contacts') as ContactRow[]))
    }
    if (k.customerNumber) {
      const c = await client.from('customers').select(custCols).ilike('customer_number', k.customerNumber).limit(10)
      rows.customers.push(...(take(c, 'customers') as CustomerRow[]))
    }
    if (k.contactId) {
      const ct = await client.from('customer_contacts').select(contactCols).eq('id', k.contactId).limit(1)
      rows.contacts.push(...(take(ct, 'contacts') as ContactRow[]))
    }
    // Dubletter fra flere opslag fjernes før klassifikation
    const uniq = <T extends { id: string }>(xs: T[]) => [...new Map(xs.map((x) => [x.id, x])).values()]
    return classifyIdentity(input, { customers: uniq(rows.customers), contacts: uniq(rows.contacts), leads: uniq(rows.leads) })
  } catch (e) {
    const code = e instanceof Error && e.message.startsWith('read:') ? e.message : 'read:unknown'
    return { state: 'read_error', candidates: [], leadIds: [], keysUsed: k.keys, error: code }
  }
}
