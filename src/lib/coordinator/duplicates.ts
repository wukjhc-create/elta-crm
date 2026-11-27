/**
 * Phase C4 — dubletkontrol for kunder. Ren funktion (ingen DB, ikke 'use server').
 *
 * Bruges (1) før en ny kunde foreslås/oprettes fra en mail, og (2) i den read-only dubletrapport over eksisterende kunder.
 * Genbruger fase B's normalisering (`normalizePartyName` = SQL party_normalize_name) og den kanoniske telefonnøgle.
 * Der sammenlægges, slettes eller ændres ALDRIG noget — kun kandidater med matchgrundlag.
 */
import { normalizePartyName } from '@/lib/parties/party-dedupe'
import { canonicalPhone } from '@/lib/utils/phone'

export type DuplicateBasis = 'email' | 'phone' | 'vat' | 'name_exact' | 'name_similar' | 'address'
export type DuplicateStrength = 'strong' | 'medium' | 'weak'

export interface DupCustomer {
  id: string; customerNumber: string | null; name: string | null; contactPerson: string | null; email: string | null
  phones: string[]; vat: string | null; address: string | null; postalCode: string | null; autoCreated: boolean; createdAt: string
}
export interface DupCandidate { customer: DupCustomer; basis: DuplicateBasis[]; strength: DuplicateStrength }
export interface DupInput { name?: string | null; contactPerson?: string | null; email?: string | null; phone?: string | null; vat?: string | null; address?: string | null; postalCode?: string | null }

export const BASIS_LABELS: Record<DuplicateBasis, string> = {
  email: 'samme e-mail', phone: 'samme telefonnummer', vat: 'samme CVR', name_exact: 'samme navn', name_similar: 'lignende navn', address: 'samme adresse',
}

const lc = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const placeholder = (e: string) => /@elta-crm\.local$/i.test(e)
const vatKey = (v: string | null | undefined) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 8 ? d : null }
const addrKey = (a: string | null | undefined, p: string | null | undefined) => {
  const x = lc(a).replace(/[^a-z0-9æøå]+/g, ' ').trim()
  return x.length >= 5 ? `${x}|${lc(p)}` : null
}

/** Navne der ligner hinanden: samme normaliserede navn, eller det ene er et præfiks/alle betydende ord går igen */
export function namesSimilar(a: string | null | undefined, b: string | null | undefined): 'exact' | 'similar' | null {
  const x = normalizePartyName(a), y = normalizePartyName(b)
  if (!x || !y) return null
  if (x === y) return 'exact'
  if (x.length < 5 || y.length < 5) return null
  const tx = x.split(' ').filter((t) => t.length >= 3), ty = y.split(' ').filter((t) => t.length >= 3)
  if (!tx.length || !ty.length) return null
  const [small, big] = tx.length <= ty.length ? [tx, new Set(ty)] : [ty, new Set(tx)]
  const all = small.every((t) => big.has(t))
  return all && small.length >= 2 ? 'similar' : all && small.length === 1 && big.size <= 2 && small[0].length >= 5 ? 'similar' : null
}

function strengthOf(basis: DuplicateBasis[]): DuplicateStrength {
  if (basis.includes('vat') || basis.includes('email') || basis.includes('phone')) return 'strong'
  if (basis.includes('name_exact') && basis.includes('address')) return 'strong'
  if (basis.includes('name_exact') || (basis.includes('name_similar') && basis.includes('address'))) return 'medium'
  return 'weak'
}

/** Find mulige dubletter af en (ny) kunde blandt eksisterende */
export function findDuplicateCandidates(input: DupInput, customers: DupCustomer[], opts: { excludeId?: string; limit?: number } = {}): DupCandidate[] {
  const email = lc(input.email)
  const phone = canonicalPhone(input.phone)
  const vat = vatKey(input.vat)
  const addr = addrKey(input.address, input.postalCode)
  const out: DupCandidate[] = []
  for (const c of customers) {
    if (c.id === opts.excludeId) continue
    const basis: DuplicateBasis[] = []
    if (email && !placeholder(email) && lc(c.email) === email) basis.push('email')
    if (phone && c.phones.some((p) => canonicalPhone(p) === phone)) basis.push('phone')
    if (vat && vatKey(c.vat) === vat) basis.push('vat')
    const nm = namesSimilar(input.name, c.name) ?? namesSimilar(input.name, c.contactPerson) ?? (input.contactPerson ? namesSimilar(input.contactPerson, c.contactPerson) : null)
    if (nm === 'exact') basis.push('name_exact'); else if (nm === 'similar') basis.push('name_similar')
    if (addr && addrKey(c.address, c.postalCode) === addr) basis.push('address')
    if (!basis.length) continue
    // Et svagt navnesammenfald alene uden andet er støj, medmindre navnet er identisk
    if (basis.length === 1 && basis[0] === 'name_similar') continue
    out.push({ customer: c, basis, strength: strengthOf(basis) })
  }
  const rank = { strong: 0, medium: 1, weak: 2 }
  return out.sort((a, b) => rank[a.strength] - rank[b.strength] || b.basis.length - a.basis.length).slice(0, opts.limit ?? 10)
}

export interface DuplicateGroup { key: string; basis: DuplicateBasis; strength: DuplicateStrength; customerIds: string[]; autoCreated: number; suggestion: string }

/**
 * Read-only dubletrapport over hele registret: grupper af kunder der deler e-mail, telefon, CVR eller identisk navn
 * (+adresse). Forslag til manuel behandling — intet ændres.
 */
export function duplicateReport(customers: DupCustomer[]): DuplicateGroup[] {
  const groups = new Map<string, { basis: DuplicateBasis; ids: Set<string> }>()
  const add = (basis: DuplicateBasis, key: string | null, id: string) => {
    if (!key) return
    const k = `${basis}:${key}`
    const g = groups.get(k) ?? { basis, ids: new Set<string>() }
    g.ids.add(id); groups.set(k, g)
  }
  for (const c of customers) {
    if (c.email && !placeholder(c.email)) add('email', lc(c.email), c.id)
    for (const p of c.phones) add('phone', canonicalPhone(p), c.id)
    add('vat', vatKey(c.vat), c.id)
    add('name_exact', normalizePartyName(c.name), c.id)
  }
  const byId = new Map(customers.map((c) => [c.id, c]))
  const out: DuplicateGroup[] = []
  for (const [key, g] of groups) {
    if (g.ids.size < 2) continue
    const ids = [...g.ids].sort()
    const members = ids.map((id) => byId.get(id)!).filter(Boolean)
    const auto = members.filter((m) => m.autoCreated).length
    let basis = g.basis
    let strength: DuplicateStrength = basis === 'name_exact' ? 'medium' : 'strong'
    if (basis === 'name_exact') {
      const sameAddr = new Set(members.map((m) => addrKey(m.address, m.postalCode)).filter(Boolean)).size === 1 && members.every((m) => addrKey(m.address, m.postalCode))
      if (sameAddr) { strength = 'strong'; basis = 'name_exact' }
    }
    const suggestion = auto === members.length ? 'Alle er automatisk oprettet fra mail — gennemgå og behold én aktiv kunde (manuelt)'
      : auto > 0 ? 'Automatisk oprettede kunder deler oplysninger med en manuelt oprettet — kontroller om de er samme kunde (manuelt)'
      : basis === 'email' ? 'Flere kunder deler e-mailadressen (fx familie/firma) — kontroller og registrér evt. som kontaktpersoner (manuelt)'
      : 'Kontroller om det er samme kunde (manuelt)'
    out.push({ key: `${g.basis}:${ids.join(',')}:${key.length}`, basis, strength, customerIds: ids, autoCreated: auto, suggestion })
  }
  const rank = { strong: 0, medium: 1, weak: 2 }
  return out.sort((a, b) => rank[a.strength] - rank[b.strength] || b.customerIds.length - a.customerIds.length)
}
