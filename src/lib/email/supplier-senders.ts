/**
 * Leverandør-/kunde-integritetsværn (2026-11-23, S2 før partsmodellen). Bevidst IKKE 'use server' — ren logik + én
 * loader med injiceret klient, så samme regel bruges af mail-linkeren, mail-analysen (email-intelligence), autolink og
 * Stage A (identitet).
 *
 * Princip: en afsender der DETERMINISTISK er kendt som leverandør må aldrig auto-oprettes som kunde, auto-kobles til en
 * kunde eller blive Stage A-kundekandidat — heller ikke når en (forurenet) kunderække med samme e-mail findes. Mailen
 * bevares og indtages internt; manuel kobling er stadig tilladt.
 *
 * Evidens (kun deterministisk — aldrig navnelighed, aldrig AI alene):
 *   A. kendte grossist-domæner (SUPPLIER_DOMAINS)
 *   B. kanoniske `suppliers`: contact_email (eksakt) og website-domæne
 *   C. historik: SAMME afsenderadresse har tidligere mails klassificeret 'supplier' — ren leverandør-historik (≥ 1
 *      supplier, 0 customer) eller klart dominerende (≥ 3 supplier og ≥ 2× customer). BLANDET historik (afsenderen er
 *      også klassificeret som kunde) er IKKE evidens — det er "både leverandør og kunde" (E), som partsmodellen afgør;
 *      indtil da gælder nuværende adfærd. Samme DOMÆNE kun ved stærk, entydig historik (≥ 3 leverandør-mails fra ≥ 2 forskellige afsendere,
 *      ≥ 80 % af domænets klassificerede mails) — aldrig gratis-/privat-maildomæner eller eget domæne.
 */
import { isFreeMailDomain, isNonCustomerDomain } from '@/lib/email/free-mail-domains'

/** Kendte grossister (flyttet hertil fra email-intelligence — én liste) */
export const SUPPLIER_DOMAINS: ReadonlySet<string> = new Set([
  'mikma.dk',
  'lemvigmueller.dk',
  'lemvigh-muller.dk',
  'lemvighmuller.dk',
  'solar.dk',
  'ao.dk',
  'eltagrossisten.dk',
])

export const DOMAIN_HISTORY_RULE = { minSupplierMails: 3, minDistinctSenders: 2, minShare: 0.8 } as const
/** Afsender-historik: ren (customer = 0) eller klart dominerende (≥ minDominant og ≥ ratio × customer) */
export const SENDER_HISTORY_RULE = { minDominant: 3, ratio: 2 } as const

export function senderHistoryIsSupplier(h: { supplier: number; customer: number }): boolean {
  if (h.supplier < 1) return false
  if (h.customer === 0) return true
  return h.supplier >= SENDER_HISTORY_RULE.minDominant && h.supplier >= SENDER_HISTORY_RULE.ratio * h.customer
}

export type SupplierEvidenceReason = 'known_wholesaler_domain' | 'supplier_contact_email' | 'supplier_website_domain' | 'sender_history_supplier' | 'domain_history_supplier'

export interface SupplierEvidence {
  supplierEmails: ReadonlySet<string>
  supplierDomains: ReadonlySet<string>
  /** Afsenderens egen historik (distinkte mails pr. klassifikation) */
  senderHistory: { supplier: number; customer: number }
  /** Domænets historik (kun beregnet for ikke-gratis, ikke-eget domæne) */
  domainHistory: { supplier: number; customer: number; supplierSenders: number } | null
}

export interface SupplierSenderDecision {
  isSupplier: boolean
  reasons: SupplierEvidenceReason[]
}

export const NO_EVIDENCE: SupplierEvidence = { supplierEmails: new Set(), supplierDomains: new Set(), senderHistory: { supplier: 0, customer: 0 }, domainHistory: null }

export function normalizeSender(raw: string | null | undefined): string | null {
  const e = String(raw ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

export function domainOf(email: string | null | undefined): string | null {
  const e = normalizeSender(email)
  return e ? e.split('@')[1] : null
}

/** website ("https://www.ao.dk/shop") → "ao.dk" */
export function websiteDomain(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0]
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : null
}

/** Må domænet overhovedet bruges som leverandør-evidens? (aldrig gratis-mail, aldrig eget/relæ-domæne) */
export function domainUsableAsEvidence(domain: string | null): boolean {
  return !!domain && !isFreeMailDomain(domain) && !isNonCustomerDomain(domain)
}

const matchesDomain = (domain: string, set: ReadonlySet<string>) => [...set].some((d) => domain === d || domain.endsWith(`.${d}`))

/** Ren afgørelse over allerede indlæst evidens */
export function decideSupplierSender(senderEmail: string | null | undefined, ev: SupplierEvidence): SupplierSenderDecision {
  const email = normalizeSender(senderEmail)
  if (!email) return { isSupplier: false, reasons: [] }
  const domain = email.split('@')[1]
  const usable = domainUsableAsEvidence(domain)
  const reasons: SupplierEvidenceReason[] = []
  if (usable && matchesDomain(domain, SUPPLIER_DOMAINS)) reasons.push('known_wholesaler_domain')
  if (ev.supplierEmails.has(email)) reasons.push('supplier_contact_email')
  if (usable && matchesDomain(domain, ev.supplierDomains)) reasons.push('supplier_website_domain')
  if (senderHistoryIsSupplier(ev.senderHistory)) reasons.push('sender_history_supplier')
  const dh = ev.domainHistory
  if (usable && dh) {
    const classified = dh.supplier + dh.customer
    if (dh.supplier >= DOMAIN_HISTORY_RULE.minSupplierMails && dh.supplierSenders >= DOMAIN_HISTORY_RULE.minDistinctSenders
      && classified > 0 && dh.supplier / classified >= DOMAIN_HISTORY_RULE.minShare) reasons.push('domain_history_supplier')
  }
  return { isSupplier: reasons.length > 0, reasons }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
type Res = { data: unknown; error: unknown }

const CACHE_MS = 60_000
const cache = new Map<string, { at: number; value: SupplierSenderDecision }>()

/**
 * Indlæs evidens for én afsender (service_role-klient på serveren; kun SELECT) og afgør. Læsefejl → kaster IKKE: den
 * statiske grossist-regel gælder stadig, og et fejlet opslag behandles som "ingen yderligere evidens" (som i dag).
 * Kort cache pr. proces (60 s), så linker, mail-analyse og Stage A i samme kørsel ikke læser tre gange.
 */
export async function classifySupplierSender(db: Db, senderEmail: string | null | undefined, opts: { now?: number; noCache?: boolean } = {}): Promise<SupplierSenderDecision> {
  const email = normalizeSender(senderEmail)
  if (!email) return { isSupplier: false, reasons: [] }
  const now = opts.now ?? Date.now()
  const hit = !opts.noCache ? cache.get(email) : undefined
  if (hit && now - hit.at < CACHE_MS) return hit.value
  const ev = await loadSupplierEvidence(db, email)
  const value = decideSupplierSender(email, ev)
  cache.set(email, { at: now, value })
  if (cache.size > 500) cache.delete(cache.keys().next().value as string)
  return value
}

export function clearSupplierSenderCache(): void { cache.clear() }

const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export async function loadSupplierEvidence(db: Db, email: string): Promise<SupplierEvidence> {
  const domain = email.split('@')[1]
  const ev: { supplierEmails: Set<string>; supplierDomains: Set<string>; senderHistory: { supplier: number; customer: number }; domainHistory: SupplierEvidence['domainHistory'] } =
    { supplierEmails: new Set(), supplierDomains: new Set(), senderHistory: { supplier: 0, customer: 0 }, domainHistory: null }
  try {
    const s = (await db.from('suppliers').select('contact_email, website').eq('is_active', true).limit(500)) as Res
    for (const r of (s.data ?? []) as Array<{ contact_email: string | null; website: string | null }>) {
      const ce = normalizeSender(r.contact_email); if (ce) { ev.supplierEmails.add(ce); const d = domainOf(ce); if (d && domainUsableAsEvidence(d)) ev.supplierDomains.add(d) }
      const wd = websiteDomain(r.website); if (wd && domainUsableAsEvidence(wd)) ev.supplierDomains.add(wd)
    }
  } catch { /* ingen ekstra evidens */ }
  const history = async (ids: string[]) => {
    if (!ids.length) return { supplier: 0, customer: 0, supplierEmailIds: new Set<string>() }
    const l = (await db.from('email_intelligence_logs').select('email_id, classification').in('email_id', ids).in('classification', ['supplier', 'customer']).limit(2000)) as Res
    const sup = new Set<string>(), cust = new Set<string>()
    for (const r of (l.data ?? []) as Array<{ email_id: string; classification: string }>) (r.classification === 'supplier' ? sup : cust).add(r.email_id)
    for (const id of sup) cust.delete(id) // samme mail klassificeret begge veje (genbehandling) tæller som leverandør
    return { supplier: sup.size, customer: cust.size, supplierEmailIds: sup }
  }
  try {
    const m = (await db.from('incoming_emails').select('id').ilike('sender_email', escLike(email)).order('created_at', { ascending: false }).limit(200)) as Res
    const h = await history(((m.data ?? []) as Array<{ id: string }>).map((r) => r.id))
    ev.senderHistory = { supplier: h.supplier, customer: h.customer }
  } catch { /* ingen historik */ }
  if (domainUsableAsEvidence(domain)) {
    try {
      const m = (await db.from('incoming_emails').select('id, sender_email').ilike('sender_email', `%@${escLike(domain)}`).order('created_at', { ascending: false }).limit(300)) as Res
      const rows = (m.data ?? []) as Array<{ id: string; sender_email: string | null }>
      const h = await history(rows.map((r) => r.id))
      const senders = new Set(rows.filter((r) => h.supplierEmailIds.has(r.id)).map((r) => String(r.sender_email ?? '').toLowerCase()))
      ev.domainHistory = { supplier: h.supplier, customer: h.customer, supplierSenders: senders.size }
    } catch { /* ingen domænehistorik */ }
  }
  return ev
}
