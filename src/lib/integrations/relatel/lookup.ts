/**
 * Opkalds-opslag (CTI-foundation, P3 #15): hvem ringer? Bevidst IKKE 'use server'.
 *
 * Koeres med den indloggede brugers klient (RLS gaelder — brugeren ser kun det, hun/han i forvejen maa se).
 * Match paa NORMALISEREDE numre (phone.ts) paa tvaers af kunder (phone+mobile), kundekontakter og leads, og
 * returnerer kundens aabne sager og tilbud. Ingen skrivning, ingen netvaerk.
 *
 * Skala: CRM'et har i dag ~100 kunder; derfor normaliseres i kode over alle raekker med telefonnummer. En
 * genereret normaliseret kolonne + indeks er vejen, hvis tabellerne vokser (kraever migration/gate).
 */
import { toRelatelNumber } from '@/lib/integrations/relatel/phone'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export interface CallerMatch {
  kind: 'customer' | 'contact' | 'lead'
  id: string
  customer_id: string | null
  label: string
  detail: string | null
}
export interface CallerLookup {
  number: string | null
  matches: CallerMatch[]
  openCases: Array<{ id: string; case_number: string | null; title: string; status: string; customer_id: string }>
  openOffers: Array<{ id: string; offer_number: string | null; title: string; status: string; customer_id: string }>
}

/** Øvre grænse pr. tabel (side for side) */
const SCAN_LIMIT = 50_000

export async function lookupCaller(client: any, rawNumber: string | null | undefined): Promise<CallerLookup> {
  const number = toRelatelNumber(rawNumber)
  const empty: CallerLookup = { number, matches: [], openCases: [], openOffers: [] }
  if (!number) return empty
  const hit = (...phones: Array<string | null | undefined>) => phones.some((p) => toRelatelNumber(p) === number)

  // Leads-review 2026-10-08 (#12): .limit(5000) gav højst 1.000 rækker (PostgREST max_rows) → opkald fra kunde nr.
  // 1.001+ blev ikke genkendt. Side for side med fast rækkefølge.
  const [custRows, contactRows, leadRows] = await Promise.all([
    fetchAllRows((f, t) => client.from('customers').select('id, customer_number, company_name, phone, mobile').or('phone.not.is.null,mobile.not.is.null').order('id').range(f, t), SCAN_LIMIT),
    fetchAllRows((f, t) => client.from('customer_contacts').select('id, customer_id, name, phone, mobile').or('phone.not.is.null,mobile.not.is.null').order('id').range(f, t), SCAN_LIMIT),
    fetchAllRows((f, t) => client.from('leads').select('id, company_name, contact_person, phone').not('phone', 'is', null).order('id').range(f, t), SCAN_LIMIT),
  ])
  const cust = { data: custRows }, contacts = { data: contactRows }, leads = { data: leadRows }
  const matches: CallerMatch[] = []
  for (const c of (cust.data ?? []) as Array<{ id: string; customer_number: string | null; company_name: string; phone: string | null; mobile: string | null }>) {
    if (hit(c.phone, c.mobile)) matches.push({ kind: 'customer', id: c.id, customer_id: c.id, label: c.company_name, detail: c.customer_number })
  }
  for (const k of (contacts.data ?? []) as Array<{ id: string; customer_id: string; name: string; phone: string | null; mobile: string | null }>) {
    if (hit(k.phone, k.mobile)) matches.push({ kind: 'contact', id: k.id, customer_id: k.customer_id, label: k.name, detail: 'kontaktperson' })
  }
  for (const l of (leads.data ?? []) as Array<{ id: string; company_name: string | null; contact_person: string | null; phone: string | null }>) {
    if (hit(l.phone)) matches.push({ kind: 'lead', id: l.id, customer_id: null, label: l.company_name || l.contact_person || 'Lead', detail: 'lead' })
  }

  const customerIds = [...new Set(matches.map((m) => m.customer_id).filter(Boolean) as string[])]
  if (!customerIds.length) return { ...empty, matches }
  const [cases, offers] = await Promise.all([
    client.from('service_cases').select('id, case_number, title, status, customer_id').in('customer_id', customerIds)
      .eq('is_proposal', false).not('status', 'in', '(closed,converted)').order('created_at', { ascending: false }).limit(20),
    client.from('offers').select('id, offer_number, title, status, customer_id').in('customer_id', customerIds)
      .in('status', ['draft', 'sent', 'viewed']).order('created_at', { ascending: false }).limit(20),
  ])
  return { number, matches, openCases: cases.data ?? [], openOffers: offers.data ?? [] }
}
