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

import { createAdressevaelgerProvider } from '@/lib/address/providers/adressevaelger'

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
  /** ADDR-1: udbyderens id for forslaget (bruges til opslag ved valg) */
  id?: string
  /** 'adresse' = enhed (etage/dør), 'husnummer' = adgangsadresse */
  kind?: 'adresse' | 'husnummer'
  /** false = foreløbigt søgeforslag (felterne fra titlen); true = slået op via id */
  resolved?: boolean
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
  /** Opslag af et valgt forslag (id fra søgningen) → fulde, normaliserede felter. */
  resolveAddress?(id: string, kind: 'adresse' | 'husnummer'): Promise<AddressSuggestion | null>
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

/**
 * Registrerede udbydere. ADDR-1 beslutning A (Henrik 2026-10-19): 'adressevaelger' (kræver ADDRESS_LOOKUP_TOKEN).
 * Uden token → slået fra (ingen gættede tokens).
 */
const PROVIDERS: Record<string, () => AddressSearchProvider | null> = {
  adressevaelger: () => {
    const token = String(process.env.ADDRESS_LOOKUP_TOKEN ?? '').trim()
    if (token.length < 10) return null
    return createAdressevaelgerProvider(token)
  },
}

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
  const provider = make()
  if (!provider) {
    if (!warned) {
      warned = true
      console.warn(`[address-lookup] udbyder "${key}" mangler konfiguration (ADDRESS_LOOKUP_TOKEN) — adresseopslag forbliver slået fra`)
    }
    return disabledAddressProvider
  }
  return provider
}

export const ADDRESS_LOOKUP_MIN_QUERY_LENGTH = 3
