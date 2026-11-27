/**
 * Phase C2 — afsendergenkendelse (identifikationsmotor). Ren funktion over indlæste data: ingen DB, ikke 'use server'.
 *
 * Svarer på "hvem er afsenderen?" med kandidater, niveau og begrundelse. Bygger på C1 (leverandørværn, automatisk afsender,
 * hjemmesideformular) og fase B's parter (verificerede e-mails/domæner, relationer).
 *
 * Niveauer:
 *  - verified  = én STÆRK, menneskeligt bekræftet nøgle (verificeret part-e-mail, menneskelig kobling i samme tråd,
 *                entydig e-mail på en kunde/kontakt oprettet af et menneske). Et svagt signal giver ALDRIG verified.
 *  - probable  = deterministisk men svagere nøgle (e-mail på auto-oprettet kunde, CVR, telefon, verificeret domæne) — eller
 *                to uafhængige svage signaler.
 *  - uncertain = lighed (navn, adresse), delt e-mailadresse (flere kunder), konflikter.
 *  - unknown   = ingen evidens. En ukendt afsender er ALDRIG en kunde — højst en "potentiel kunde" (prospect).
 *
 * Regler (Henrik 2026-11-27): e-mail alene afgør ikke identiteten når flere kunder deler adressen; et domæne alene giver
 * ingen adgang til en kundes sager (domæne-kandidater markeres `domainOnly`); en sagsreference verificerer ALDRIG afsenderen;
 * videresendte mails identificerer den oprindelige afsender (videresenderen noteres); signaler fra signatur/tekst tages kun
 * fra mailens egen tekst (citeret historik og ELTA's egne numre tæller ikke).
 */
import { canonicalPhone } from '@/lib/utils/phone'
import { normalizePartyName } from '@/lib/parties/party-dedupe'

export const IDENTITY_LEVELS = ['verified', 'probable', 'uncertain', 'unknown'] as const
export type IdentityLevel = (typeof IDENTITY_LEVELS)[number]
export const SENDER_KINDS = ['customer', 'contact', 'prospect', 'supplier', 'partner', 'employee', 'automated', 'unknown'] as const
export type SenderKind = (typeof SENDER_KINDS)[number]

export type EvidenceCode =
  | 'verified_party_email' | 'thread_human_link' | 'email_human_customer' | 'email_contact' | 'email_auto_customer'
  | 'email_shared' | 'form_email' | 'verified_party_domain' | 'vat' | 'phone' | 'name_similar' | 'address_similar'
  | 'previous_correspondence' | 'party_relation' | 'supplier_register' | 'employee_profile' | 'elta_domain'
  | 'automated_sender' | 'case_reference_customer'

const STRONG: ReadonlySet<EvidenceCode> = new Set(['verified_party_email', 'thread_human_link', 'email_human_customer', 'email_contact'])
const WEAK_DETERMINISTIC: ReadonlySet<EvidenceCode> = new Set(['email_auto_customer', 'form_email', 'verified_party_domain', 'vat', 'phone'])

export const EVIDENCE_LABELS: Record<EvidenceCode, string> = {
  verified_party_email: 'e-mailen er bekræftet på parten ("Husk afsender")',
  thread_human_link: 'en tidligere mail i samme tråd er koblet af en medarbejder',
  email_human_customer: 'e-mailen står på en kunde oprettet af en medarbejder',
  email_contact: 'e-mailen står på en kontaktperson',
  email_auto_customer: 'e-mailen står på en automatisk oprettet kunde',
  email_shared: 'flere kunder deler e-mailadressen',
  form_email: 'e-mailen er angivet i hjemmesideformularen',
  verified_party_domain: 'domænet er bekræftet på parten (giver ikke adgang til sager)',
  vat: 'CVR-nummeret i mailen matcher',
  phone: 'telefonnummeret i mailen matcher',
  name_similar: 'navnet ligner',
  address_similar: 'adressen ligner',
  previous_correspondence: 'tidligere korrespondance med samme afsender er koblet hertil',
  party_relation: 'parten har en aktiv relation',
  supplier_register: 'afsenderen genkendes som leverandør',
  employee_profile: 'afsenderen er en medarbejder',
  elta_domain: 'afsenderen bruger ELTA\'s eget domæne',
  automated_sender: 'afsenderen er en automatisk systemadresse',
  case_reference_customer: 'mailen nævner en sag hos kunden (verificerer ikke afsenderen)',
}

export interface IdCustomer {
  id: string; name: string | null; email: string | null; phone: string | null; vat: string | null; address: string | null
  autoCreated: boolean; createdAt: string; contactPerson?: string | null
}
export interface IdContact { id: string; customerId: string; name: string | null; email: string | null; phone: string | null; createdAt: string }
export interface IdParty {
  id: string; name: string; kind: 'person' | 'organisation'; customerId: string | null; supplierId: string | null; profileId: string | null
  verifiedEmails: string[]; verifiedDomains: string[]; vat: string | null; relationships: string[]
}
export interface IdEmployee { profileId: string; email: string; name: string | null }

export interface IdentityInput {
  /** Effektiv afsender: ved videresendelse den oprindelige afsender (normaliseret, små bogstaver) */
  senderEmail: string | null
  senderName: string | null
  forwarded: { isForwarded: boolean; forwarderEmail: string | null; originalKnown: boolean }
  webForm: { email: string | null; phone: string | null; name: string | null; address: string | null } | null
  /** Signaler fra mailens EGEN tekst (signatur o.l.) — citeret historik og ELTA's egne numre er fjernet af loaderen */
  textPhones: string[]
  textVats: string[]
  /** C1: leverandørværnets afgørelse og automatisk afsender */
  supplier: { isSupplier: boolean; reasons: string[] }
  automated: boolean
  internalDomain: boolean
  /** Tidligere mails i samme tråd koblet af en medarbejder (kunde-id'er) og tidligere mails fra samme afsender koblet manuelt */
  threadHumanCustomerIds: string[]
  previousManualCustomerIds: string[]
  customers: IdCustomer[]
  contacts: IdContact[]
  parties: IdParty[]
  employees: IdEmployee[]
  /** Kunder bag sagsnumre nævnt i mailen (sagsreferencen verificerer IKKE afsenderen) */
  caseReferenceCustomerIds: string[]
  /** Mailens modtagelsestidspunkt — kun kunder/kontakter oprettet før tæller */
  receivedAt: string
}

export interface IdentityCandidate {
  type: 'customer' | 'party' | 'employee'
  id: string
  /** Kunde-id når kandidaten kan føres til en kunde (kunde, kontaktens kunde, part med kunde) */
  customerId: string | null
  label: string
  level: IdentityLevel
  evidence: EvidenceCode[]
  relationships: string[]
  /** Kun domæne-evidens → giver ALDRIG adgang til kundens sager */
  domainOnly: boolean
  contactId?: string | null
}

export interface SenderIdentity {
  version: 'c2-v1'
  kind: SenderKind
  level: IdentityLevel
  primary: IdentityCandidate | null
  alternatives: IdentityCandidate[]
  conflicts: string[]
  forwardedBy: string | null
  explanation: string[]
}

const LEVEL_RANK: Record<IdentityLevel, number> = { verified: 3, probable: 2, uncertain: 1, unknown: 0 }
const lc = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const domainOf = (e: string | null) => (e && e.includes('@') ? e.split('@')[1] : null)
const before = (iso: string, at: string) => Date.parse(iso) < Date.parse(at)

function levelFor(evidence: EvidenceCode[], shared: boolean): IdentityLevel {
  const strong = evidence.filter((e) => STRONG.has(e))
  const weak = new Set(evidence.filter((e) => WEAK_DETERMINISTIC.has(e)))
  // Delt e-mailadresse: e-mail alene afgør ikke — kun et uafhængigt signal (tlf/CVR/navn/menneskelig kobling) løfter
  if (shared) {
    if (evidence.includes('thread_human_link') || evidence.includes('verified_party_email')) return 'probable'
    const extra = evidence.filter((e) => e === 'phone' || e === 'vat' || e === 'name_similar' || e === 'previous_correspondence')
    return extra.length ? 'probable' : 'uncertain'
  }
  if (strong.length) return 'verified'
  if (weak.size >= 2) return 'probable'
  if (weak.size === 1) {
    // Domæne alene er kun en organisationskandidat; e-mail på auto-kunde, CVR, telefon og formular-e-mail er "sandsynlig"
    return 'probable'
  }
  if (evidence.some((e) => e === 'name_similar' || e === 'address_similar' || e === 'previous_correspondence' || e === 'case_reference_customer')) return 'uncertain'
  return 'unknown'
}

function nameSimilar(a: string | null, b: string | null): boolean {
  const x = normalizePartyName(a), y = normalizePartyName(b)
  if (!x || !y || x.length < 4 || y.length < 4) return false
  if (x === y) return true
  const tx = new Set(x.split(' ').filter((t) => t.length >= 3)), ty = new Set(y.split(' ').filter((t) => t.length >= 3))
  if (!tx.size || !ty.size) return false
  let common = 0
  for (const t of tx) if (ty.has(t)) common++
  return common >= 2 || (common === 1 && Math.min(tx.size, ty.size) === 1 && Math.max(tx.size, ty.size) <= 2)
}

function addressSimilar(a: string | null, b: string | null): boolean {
  const n = (s: string | null) => lc(s).replace(/[^a-z0-9æøå ]+/g, ' ').replace(/\s+/g, ' ').trim()
  const x = n(a), y = n(b)
  return x.length >= 6 && y.length >= 6 && (x === y || x.startsWith(y) || y.startsWith(x))
}

/** Identificér afsenderen. Deterministisk; samme input → samme output. */
export function identifySender(input: IdentityInput): SenderIdentity {
  const conflicts: string[] = []
  const sender = lc(input.senderEmail) || null
  const domain = domainOf(sender)
  const at = input.receivedAt
  const forwardedBy = input.forwarded.isForwarded ? lc(input.forwarded.forwarderEmail) || null : null
  if (input.forwarded.isForwarded && !input.forwarded.originalKnown) conflicts.push('forwarded_original_unknown')

  // 1. Medarbejder / intern
  const employee = sender ? input.employees.find((e) => lc(e.email) === sender) : undefined
  if (employee || input.internalDomain) {
    const cand: IdentityCandidate | null = employee ? { type: 'employee', id: employee.profileId, customerId: null, label: employee.name ?? 'Medarbejder',
      level: 'verified', evidence: ['employee_profile'], relationships: ['internal'], domainOnly: false } : null
    return finish('employee', cand, [], conflicts, forwardedBy, employee ? ['employee_profile'] : ['elta_domain'])
  }

  // 2. Kandidater (kunder, kontakter, parter) med evidens
  const byKey = new Map<string, IdentityCandidate>()
  const add = (key: string, base: Omit<IdentityCandidate, 'evidence' | 'level'>, ev: EvidenceCode) => {
    const c = byKey.get(key) ?? { ...base, evidence: [], level: 'unknown' as IdentityLevel }
    if (!c.evidence.includes(ev)) c.evidence.push(ev)
    byKey.set(key, c)
  }
  const customers = input.customers.filter((c) => before(c.createdAt, at))
  const contacts = input.contacts.filter((c) => before(c.createdAt, at))
  const custById = new Map(customers.map((c) => [c.id, c]))
  const custBase = (c: IdCustomer) => ({ type: 'customer' as const, id: c.id, customerId: c.id, label: c.name ?? 'Kunde', relationships: ['customer'], domainOnly: false })

  const matchEmails = [sender, input.webForm ? lc(input.webForm.email) || null : null].filter((x): x is string => !!x)
  const emailCustomerIds = new Set<string>()
  for (const em of matchEmails) {
    for (const c of customers) if (lc(c.email) === em) emailCustomerIds.add(c.id)
    for (const k of contacts) if (lc(k.email) === em && custById.has(k.customerId)) emailCustomerIds.add(k.customerId)
  }
  const shared = emailCustomerIds.size > 1
  for (const em of matchEmails) {
    const viaForm = !!input.webForm && em === lc(input.webForm.email) && em !== sender
    for (const c of customers) if (lc(c.email) === em) {
      add(`c:${c.id}`, custBase(c), viaForm ? 'form_email' : c.autoCreated ? 'email_auto_customer' : 'email_human_customer')
      if (shared) add(`c:${c.id}`, custBase(c), 'email_shared')
    }
    for (const k of contacts) if (lc(k.email) === em) {
      const c = custById.get(k.customerId); if (!c) continue
      add(`c:${c.id}`, { ...custBase(c), contactId: k.id, label: `${c.name ?? 'Kunde'}${k.name ? ` · ${k.name}` : ''}` }, viaForm ? 'form_email' : 'email_contact')
      if (shared) add(`c:${c.id}`, custBase(c), 'email_shared')
    }
  }

  // Telefon og CVR fra mailens egen tekst / formularen
  const phones = new Set([...input.textPhones, input.webForm?.phone ?? null].map((p) => canonicalPhone(p)).filter((p): p is string => !!p))
  const vats = new Set(input.textVats.map((v) => v.replace(/\D/g, '')).filter((v) => v.length === 8))
  const phoneHits = customers.filter((c) => { const p = canonicalPhone(c.phone); return !!p && phones.has(p) })
  const contactPhoneHits = contacts.filter((k) => { const p = canonicalPhone(k.phone); return !!p && phones.has(p) && custById.has(k.customerId) })
  const phoneCustomerIds = new Set([...phoneHits.map((c) => c.id), ...contactPhoneHits.map((k) => k.customerId)])
  for (const id of phoneCustomerIds) add(`c:${id}`, custBase(custById.get(id) as IdCustomer), 'phone')
  if (phoneCustomerIds.size > 1) conflicts.push('phone_matches_several_customers')
  for (const c of customers) if (c.vat && vats.has(c.vat.replace(/\D/g, ''))) add(`c:${c.id}`, custBase(c), 'vat')

  // Navn (afsendernavn/formularnavn) og adresse — kun som lighed, aldrig alene mere end usikker
  const names = [input.senderName, input.webForm?.name ?? null].filter((n): n is string => !!n && n.trim().length >= 4)
  if (names.length && !shared) {
    for (const c of customers) if (names.some((n) => nameSimilar(n, c.name) || nameSimilar(n, c.contactPerson ?? null))) add(`c:${c.id}`, custBase(c), 'name_similar')
  } else if (names.length && shared) {
    for (const id of emailCustomerIds) { const c = custById.get(id); if (c && names.some((n) => nameSimilar(n, c.name) || nameSimilar(n, c.contactPerson ?? null))) add(`c:${c.id}`, custBase(c), 'name_similar') }
  }
  if (input.webForm?.address) for (const c of customers) if (addressSimilar(input.webForm.address, c.address) && byKey.has(`c:${c.id}`)) add(`c:${c.id}`, custBase(c), 'address_similar')

  // Tråd koblet af menneske / tidligere manuel kobling af samme afsender
  for (const id of input.threadHumanCustomerIds) { const c = custById.get(id); if (c) add(`c:${c.id}`, custBase(c), 'thread_human_link') }
  for (const id of input.previousManualCustomerIds) { const c = custById.get(id); if (c) add(`c:${c.id}`, custBase(c), 'previous_correspondence') }
  // Sagsreference: kun som (usikker) evidens på en kunde der allerede er kandidat — verificerer aldrig
  for (const id of input.caseReferenceCustomerIds) {
    const c = custById.get(id); if (!c) continue
    if (byKey.has(`c:${id}`)) add(`c:${id}`, custBase(c), 'case_reference_customer')
    else conflicts.push('case_reference_other_customer')
  }

  // Parter: verificeret e-mail (stærk), verificeret domæne (kun organisation, giver ikke sagsadgang), CVR
  for (const p of input.parties) {
    const rels = p.relationships
    const base = { type: 'party' as const, id: p.id, customerId: p.customerId, label: p.name, relationships: rels, domainOnly: false }
    const key = p.customerId && byKey.has(`c:${p.customerId}`) ? `c:${p.customerId}` : `p:${p.id}`
    const hitEmail = !!sender && p.verifiedEmails.map(lc).includes(sender)
    const hitDomain = !!domain && p.verifiedDomains.map(lc).includes(domain)
    const hitVat = !!p.vat && vats.has(p.vat.replace(/\D/g, ''))
    if (hitEmail) add(key, base, 'verified_party_email')
    if (hitDomain) add(key, base, 'verified_party_domain')
    if (hitVat) add(key, base, 'vat')
    if ((hitEmail || hitDomain || hitVat) && rels.length) add(key, base, 'party_relation')
    const c = byKey.get(key)
    if (c && key.startsWith('c:')) for (const r of rels) if (!c.relationships.includes(r)) c.relationships.push(r)
  }

  const cands = [...byKey.values()].map((c) => {
    const isShared = c.evidence.includes('email_shared')
    const level = levelFor(c.evidence, isShared)
    const domainOnly = c.evidence.every((e) => e === 'verified_party_domain' || e === 'party_relation')
    return { ...c, level, domainOnly }
  }).filter((c) => c.level !== 'unknown')
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.evidence.length - a.evidence.length || a.label.localeCompare(b.label, 'da'))

  if (shared) conflicts.push('email_shared_by_customers')
  const top = cands[0] ?? null
  const sameTop = top ? cands.filter((c) => LEVEL_RANK[c.level] === LEVEL_RANK[top.level]) : []
  // Flere kandidater på topniveau → ingen primær; alle vises som alternativer
  const ambiguous = sameTop.length > 1
  if (ambiguous) conflicts.push('several_candidates_same_level')

  // 3. Art (kind)
  const relOf = (c: IdentityCandidate | null) => new Set(c?.relationships ?? [])
  const partnerRel = (s: Set<string>) => s.has('cooperation_partner') || s.has('subcontractor') || s.has('manufacturer')
  let kind: SenderKind
  const topRels = relOf(ambiguous ? null : top)
  const supplierByRel = topRels.has('supplier')
  if (input.automated && !top) kind = 'automated'
  else if (partnerRel(topRels)) kind = 'partner'
  else if (input.supplier.isSupplier || supplierByRel) {
    // Leverandørevidens mod en menneskeskabt kundekandidat = konflikt → ingen afgørelse
    if (top && top.customerId && !supplierByRel && top.evidence.includes('email_human_customer')) { conflicts.push('supplier_evidence_vs_customer'); kind = 'unknown' }
    else kind = 'supplier'
  } else if (top && !ambiguous && top.customerId && !top.domainOnly) kind = top.contactId ? 'contact' : 'customer'
  else if (input.webForm) kind = 'prospect'
  else kind = 'unknown'

  const primary = ambiguous ? null : top
  const alternatives = (primary ? cands.slice(1) : cands).slice(0, 6)
  const ev: EvidenceCode[] = []
  if (input.supplier.isSupplier) ev.push('supplier_register')
  if (input.automated) ev.push('automated_sender')
  return finish(kind, primary, alternatives, conflicts, forwardedBy, ev)
}

function finish(kind: SenderKind, primary: IdentityCandidate | null, alternatives: IdentityCandidate[], conflicts: string[], forwardedBy: string | null, extra: EvidenceCode[]): SenderIdentity {
  const level: IdentityLevel = kind === 'employee' || kind === 'automated' || kind === 'supplier' && !primary
    ? (kind === 'supplier' ? 'probable' : primary ? primary.level : 'probable')
    : primary ? primary.level : alternatives.length ? 'uncertain' : 'unknown'
  const explanation: string[] = []
  const kindText: Record<SenderKind, string> = {
    customer: 'Eksisterende kunde', contact: 'Kontaktperson hos kunde', prospect: 'Potentiel kunde (ikke oprettet)', supplier: 'Leverandør',
    partner: 'Samarbejdspartner', employee: 'Medarbejder', automated: 'Automatisk systemafsender', unknown: 'Ukendt afsender',
  }
  explanation.push(`${kindText[kind]} — ${LEVEL_TEXT[level]}`)
  if (primary) explanation.push(`${primary.label}: ${primary.evidence.map((e) => EVIDENCE_LABELS[e]).join('; ')}`)
  for (const e of extra) explanation.push(EVIDENCE_LABELS[e])
  if (alternatives.length) explanation.push(`${alternatives.length} ${alternatives.length === 1 ? 'anden mulighed' : 'andre muligheder'} — vælg selv`)
  for (const c of conflicts) explanation.push(CONFLICT_TEXT[c] ?? c)
  if (forwardedBy) explanation.push('Mailen er videresendt — den oprindelige afsender er brugt til genkendelsen')
  if (kind === 'unknown' || kind === 'prospect') explanation.push('Afsenderen betragtes ikke som kunde, før en medarbejder vælger det')
  return { version: 'c2-v1', kind, level, primary, alternatives, conflicts: [...new Set(conflicts)], forwardedBy, explanation }
}

export const LEVEL_TEXT: Record<IdentityLevel, string> = {
  verified: 'verificeret', probable: 'sandsynlig', uncertain: 'usikker', unknown: 'ukendt',
}
export const CONFLICT_TEXT: Record<string, string> = {
  forwarded_original_unknown: 'Videresendt mail uden genkendelig oprindelig afsender',
  email_shared_by_customers: 'Flere kunder deler e-mailadressen — e-mail alene afgør ikke identiteten',
  several_candidates_same_level: 'Flere lige gode kandidater — intet valgt automatisk',
  phone_matches_several_customers: 'Telefonnummeret findes på flere kunder',
  case_reference_other_customer: 'Mailen nævner en sag hos en anden kunde end afsenderen',
  supplier_evidence_vs_customer: 'Afsenderen ligner både leverandør og kunde — vurder selv',
}
