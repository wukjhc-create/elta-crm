import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fælles part- og adresse-resolver for "sagen som omdrejningspunkt".
 *
 * ÉT sted der svarer: hvem skal underskrive/godkende (anlægsejer), hvem får
 * kopi/faktura (betaler), og hvor sidder anlægget (leveringsadresse) —
 * resolvet fra sagens parter (migration 00112/00115) MED fallbacks, så det
 * IKKE knækker på gamle sager hvor parterne ikke er udfyldt. Tager en
 * Supabase-klient så samme logik bruges fra authenticated actions OG
 * service-role admin-flows (public confirm / sekvens).
 */

export type CasePartyRole = 'end_customer' | 'payer' | 'orderer' | 'site_customer' | 'document_customer'

export interface ResolvedParty {
  customerId: string
  role: CasePartyRole
  /** hvilken kolonne værdien faktisk kom fra (transparens/debug) */
  resolvedFrom: 'end_customer_id' | 'payer_customer_id' | 'site_customer_id' | 'customer_id'
  companyName: string | null
  contactPerson: string | null
  email: string | null
}

export interface ResolvedSiteAddress {
  source: 'service_case' | 'site_customer' | 'customer' | 'none'
  address: string | null
  postalCode: string | null
  city: string | null
  floorDoor: string | null
  /** én-linje, klar til PDF/visning ('' hvis intet) */
  formatted: string
}

export interface CasePartyContext {
  caseId: string
  primaryCustomerId: string | null
  billingMode: string | null
  /** alle distinkte parter på sagen — til ejerskabs-/whitelist-tjek */
  partyCustomerIds: string[]
  /** hvem skal underskrive/godkende (besigtigelse, fuldmagt) = anlægsejer */
  signer: ResolvedParty | null
  /** hvem får kopi / det endelige dokument / faktura */
  payer: ResolvedParty | null
  /** hvor anlægget fysisk sidder */
  siteAddress: ResolvedSiteAddress
}

interface CaseRow {
  id: string
  customer_id: string | null
  orderer_customer_id: string | null
  end_customer_id: string | null
  payer_customer_id: string | null
  site_customer_id: string | null
  billing_mode: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  floor_door: string | null
}

interface CustomerRow {
  id: string
  company_name: string | null
  contact_person: string | null
  email: string | null
  billing_address: string | null
  billing_postal_code: string | null
  billing_city: string | null
  shipping_address: string | null
  shipping_postal_code: string | null
  shipping_city: string | null
}

const CASE_COLUMNS =
  'id, customer_id, orderer_customer_id, end_customer_id, payer_customer_id, site_customer_id, billing_mode, address, postal_code, city, floor_door'
const CUSTOMER_COLUMNS =
  'id, company_name, contact_person, email, billing_address, billing_postal_code, billing_city, shipping_address, shipping_postal_code, shipping_city'

function oneLine(parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p || '').trim()).filter(Boolean).join(', ')
}

/**
 * Resolv parter + leveringsadresse for én sag. Returnerer null hvis sagen
 * ikke findes. Robuste fallbacks — virker på gamle sager uden udfyldte parter.
 *
 * DATAHENTNING: præcis ÉT opslag på service_cases (maybeSingle på id) +
 * ÉT batch-opslag på customers (.in() over de få distinkte part-id'er).
 * Ingen N+1 — aldrig ét opslag pr. part.
 */
export async function resolveCaseParties(
  supabase: SupabaseClient,
  caseId: string,
): Promise<CasePartyContext | null> {
  // (1) ÉT opslag på sagen
  const { data: caseRow, error } = await supabase
    .from('service_cases')
    .select(CASE_COLUMNS)
    .eq('id', caseId)
    .maybeSingle<CaseRow>()
  if (error || !caseRow) return null

  // Fallback-kæder — så det aldrig knækker på gamle sager:
  //  signer (underskriver/godkender) = anlægsejer → leveringskunde → primær kunde
  //  payer  (kopi/faktura)           = betaler     → primær kunde
  const signerId = caseRow.end_customer_id || caseRow.site_customer_id || caseRow.customer_id || null
  const signerFrom: ResolvedParty['resolvedFrom'] = caseRow.end_customer_id
    ? 'end_customer_id'
    : caseRow.site_customer_id
      ? 'site_customer_id'
      : 'customer_id'

  const payerId = caseRow.payer_customer_id || caseRow.customer_id || null
  const payerFrom: ResolvedParty['resolvedFrom'] = caseRow.payer_customer_id ? 'payer_customer_id' : 'customer_id'

  const partyCustomerIds = Array.from(
    new Set(
      [
        caseRow.customer_id,
        caseRow.orderer_customer_id,
        caseRow.end_customer_id,
        caseRow.payer_customer_id,
        caseRow.site_customer_id,
      ].filter((v): v is string => !!v),
    ),
  )

  // (2) ÉT batch-opslag på customers for de få distinkte part-id'er
  const ids = Array.from(
    new Set([signerId, payerId, caseRow.site_customer_id, caseRow.customer_id].filter((v): v is string => !!v)),
  )
  const customerById = new Map<string, CustomerRow>()
  if (ids.length > 0) {
    const { data: customers } = await supabase.from('customers').select(CUSTOMER_COLUMNS).in('id', ids)
    for (const c of (customers as CustomerRow[] | null) || []) customerById.set(c.id, c)
  }

  const buildParty = (
    id: string | null,
    role: CasePartyRole,
    resolvedFrom: ResolvedParty['resolvedFrom'],
  ): ResolvedParty | null => {
    if (!id) return null
    const c = customerById.get(id)
    return {
      customerId: id,
      role,
      resolvedFrom,
      companyName: c?.company_name ?? null,
      contactPerson: c?.contact_person ?? null,
      email: c?.email ?? null,
    }
  }

  return {
    caseId: caseRow.id,
    primaryCustomerId: caseRow.customer_id,
    billingMode: caseRow.billing_mode,
    partyCustomerIds,
    signer: buildParty(signerId, 'end_customer', signerFrom),
    payer: buildParty(payerId, 'payer', payerFrom),
    siteAddress: resolveSiteAddress(caseRow, customerById),
  }
}

function resolveSiteAddress(caseRow: CaseRow, customerById: Map<string, CustomerRow>): ResolvedSiteAddress {
  // 1) Sagens egen adresse (00066) — den fysiske anlægsadresse
  if ((caseRow.address || '').trim()) {
    return {
      source: 'service_case',
      address: caseRow.address,
      postalCode: caseRow.postal_code,
      city: caseRow.city,
      floorDoor: caseRow.floor_door,
      formatted: oneLine([caseRow.address, caseRow.floor_door, caseRow.postal_code, caseRow.city]),
    }
  }
  // 2) Leveringskundens adresse → 3) primær kundes adresse
  const fromCustomer = (id: string | null, source: 'site_customer' | 'customer'): ResolvedSiteAddress | null => {
    if (!id) return null
    const c = customerById.get(id)
    if (!c) return null
    const address = c.shipping_address || c.billing_address || null
    const postalCode = c.shipping_postal_code || c.billing_postal_code || null
    const city = c.shipping_city || c.billing_city || null
    if (!address && !postalCode && !city) return null
    return { source, address, postalCode, city, floorDoor: null, formatted: oneLine([address, postalCode, city]) }
  }
  return (
    fromCustomer(caseRow.site_customer_id, 'site_customer') ||
    fromCustomer(caseRow.customer_id, 'customer') || {
      source: 'none', address: null, postalCode: null, city: null, floorDoor: null, formatted: '',
    }
  )
}
