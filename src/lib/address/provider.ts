/**
 * ADDR-1 (Henrik 2026-10-19): udbyder-abstraktion for danske adresseopslag. DAWA svarer 410 Gone, og GSearch lukker
 * ved udgangen af oktober 2026 — derfor ingen hårdkodet udbyder. En ny udbyder implementerer AddressSearchProvider og
 * vælges via ADDRESS_LOOKUP_PROVIDER, når konfigurationen er bekræftet (BLOCKED_CONFIGURATION / RESEARCH).
 *
 * Regler:
 *  - ADDRESS_LOOKUP_ENABLED=false (standard) → ingen netværkskald; manuel adresseindtastning virker uændret.
 *  - Nøgler/tokens kun serverside (process.env), aldrig til klienten. Ingen gættede tokens.
 *  - En udbyder der fejler, giver tomme svar — aldrig en fejl i UI'et.
 * Bevidst IKKE 'use server'.
 */

export interface AddressSuggestion {
  /** Mennesker-læsbar adresse — fx "Odinsvej 10, 4100 Ringsted". */
  label: string
  street: string
  houseNumber?: string
  floor?: string
  door?: string
  postalCode: string
  city: string
  /** Kommunekode (fx "0265"). Sjældent brugt. */
  municipality?: string
  latitude?: number
  longitude?: number
  /** Udbyderens id for den fulde adresse (historisk DAWA-id). */
  dawaId?: string
  /** Udbyderens id for adgangsadressen (bygningsniveau). */
  adgangsadresseId?: string
}

export interface PostcodeInfo {
  postalCode: string
  city: string
}

export interface AddressSearchOptions {
  /** Max antal forslag (1–20). */
  limit?: number
  /** Timeout i ms. */
  timeoutMs?: number
}

export interface AddressSearchProvider {
  /** Kort id (logning/diagnose), fx 'disabled'. */
  readonly name: string
  readonly enabled: boolean
  searchAddresses(query: string, options?: AddressSearchOptions): Promise<AddressSuggestion[]>
  lookupPostcode(postcode: string): Promise<PostcodeInfo | null>
  /** Udbyderens rå svar → vores stabile form (null hvis ufuldstændigt). */
  normalizeAddress(raw: unknown): AddressSuggestion | null
}

/** Standard: intet opslag (ingen netværkskald). */
export const disabledAddressProvider: AddressSearchProvider = {
  name: 'disabled',
  enabled: false,
  async searchAddresses() { return [] },
  async lookupPostcode() { return null },
  normalizeAddress() { return null },
}

/** Registrerede udbydere. Ingen aktiv endnu — tilføjes når ADDR-1-research er besluttet. */
const PROVIDERS: Record<string, () => AddressSearchProvider> = {}

let warned = false

/** Den aktive udbyder: kun når ADDRESS_LOOKUP_ENABLED=true OG en registreret udbyder er valgt; ellers 'disabled'. */
export function getAddressProvider(): AddressSearchProvider {
  if (process.env.ADDRESS_LOOKUP_ENABLED !== 'true') return disabledAddressProvider
  const key = String(process.env.ADDRESS_LOOKUP_PROVIDER ?? '').trim()
  const make = PROVIDERS[key]
  if (!make) {
    if (!warned) {
      warned = true
      console.warn(`[address-lookup] ADDRESS_LOOKUP_ENABLED=true, men ukendt/ingen udbyder ("${key}") — adresseopslag forbliver slået fra`)
    }
    return disabledAddressProvider
  }
  return make()
}

export const ADDRESS_LOOKUP_MIN_QUERY_LENGTH = 3
