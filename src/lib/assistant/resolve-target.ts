/**
 * ELTA Assistant (T1) — find præcis ÉN kunde eller sag ud fra kommandoens mål ("Hansen", "SVC-01019").
 * CRM er source of truth: opslaget sker i CRM-tabellerne med den klient kalderen giver (brugerens egne rettigheder).
 * Tvetydighed gættes ALDRIG — flere lige gode træf → kandidatliste, som brugeren vælger imellem.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { orIlikeContains, pgQuote, escapeLike } from '@/lib/validations/postgrest-filter'

export type TargetCandidate = {
  kind: 'customer' | 'case'
  id: string
  /** Kunden for en sag (eller kunden selv); en sag kan mangle kunde */
  customerId: string | null
  label: string
}

export type TargetResolution =
  | { status: 'resolved'; target: TargetCandidate }
  | { status: 'ambiguous'; candidates: TargetCandidate[] }
  | { status: 'none' }

export const MAX_CANDIDATES = 5

type CustomerRow = { id: string; customer_number: string | null; company_name: string | null; contact_person: string | null; email: string | null }

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

export function customerLabel(c: CustomerRow): string {
  const name = c.company_name || c.contact_person || c.email || 'Ukendt kunde'
  const extra = c.company_name && c.contact_person && norm(c.company_name) !== norm(c.contact_person) ? ` (${c.contact_person})` : ''
  return `${name}${extra}${c.customer_number ? ` · ${c.customer_number}` : ''}`
}

/**
 * Ren rangering af kunde-træf: et entydigt præcist træf (kundenr., e-mail, firmanavn eller kontaktperson) vinder;
 * ellers er ét træf i alt entydigt; ellers tvetydigt.
 */
export function rankCustomers(term: string, rows: CustomerRow[]): TargetResolution {
  if (!rows.length) return { status: 'none' }
  const t = norm(term)
  const toCand = (c: CustomerRow): TargetCandidate => ({ kind: 'customer', id: c.id, customerId: c.id, label: customerLabel(c) })
  const exact = rows.filter((c) => [c.customer_number, c.email, c.company_name, c.contact_person].some((v) => norm(v) === t))
  if (exact.length === 1) return { status: 'resolved', target: toCand(exact[0]) }
  if (exact.length > 1) return { status: 'ambiguous', candidates: exact.slice(0, MAX_CANDIDATES).map(toCand) }
  if (rows.length === 1) return { status: 'resolved', target: toCand(rows[0]) }
  return { status: 'ambiguous', candidates: rows.slice(0, MAX_CANDIDATES).map(toCand) }
}

const CASE_NUMBER = /^svc-\d+$/i

/** Hvilke af disse sags-id'er må brugeren se? (samme sags-scope som CRM'et — assistenten kører med admin-klienten) */
export type CaseScopeFilter = (caseIds: string[]) => Promise<Set<string>>

export async function resolveTarget(client: SupabaseClient, rawTerm: string, caseFilter?: CaseScopeFilter): Promise<TargetResolution> {
  const term = rawTerm.replace(/\s+/g, ' ').trim()
  if (term.length < 2) return { status: 'none' }

  if (CASE_NUMBER.test(term)) {
    const { data, error } = await client
      .from('service_cases')
      .select('id, case_number, title, customer_id')
      .ilike('case_number', term)
      .limit(2)
    if (error) throw error
    const all = (data ?? []) as Array<{ id: string; case_number: string; title: string | null; customer_id: string | null }>
    // Assistent-review 2026-10-08 (#1): sager uden for brugerens scope findes ikke (heller ikke i kandidatlisten)
    const allowed = caseFilter ? await caseFilter(all.map((r) => r.id)) : null
    const rows = allowed ? all.filter((r) => allowed.has(r.id)) : all
    if (rows.length !== 1) return rows.length ? { status: 'ambiguous', candidates: rows.map((r) => ({ kind: 'case', id: r.id, customerId: r.customer_id, label: `${r.case_number} ${r.title ?? ''}`.trim() })) } : { status: 'none' }
    const r = rows[0]
    return { status: 'resolved', target: { kind: 'case', id: r.id, customerId: r.customer_id, label: `${r.case_number} ${r.title ?? ''}`.trim() } }
  }

  // Assistent-review 2026-10-08 (#8): præcise træf søges for sig — før kun blandt de første 20 delstrengs-træf, så et
  // præcist træf længere nede blev overset, og et andet blev valgt uden at spørge
  const exactPattern = pgQuote(escapeLike(term))
  const { data: exactRows, error: exactErr } = await client
    .from('customers')
    .select('id, customer_number, company_name, contact_person, email')
    .eq('is_active', true)
    .or(['company_name', 'contact_person', 'email', 'customer_number'].map((c) => `${c}.ilike.${exactPattern}`).join(','))
    .order('company_name')
    .limit(MAX_CANDIDATES + 1)
  if (exactErr) throw exactErr
  if ((exactRows ?? []).length > 0) return rankCustomers(term, (exactRows ?? []) as CustomerRow[])

  const { data, error } = await client
    .from('customers')
    .select('id, customer_number, company_name, contact_person, email')
    .eq('is_active', true)
    .or(orIlikeContains(['company_name', 'contact_person', 'email', 'customer_number'], term))
    .order('company_name')
    .limit(20)
  if (error) throw error
  return rankCustomers(term, (data ?? []) as CustomerRow[])
}
