/**
 * Sprint 9D — Dansk adresse-lookup wrapper (UI'en går altid via /api/address/search).
 *
 * ADDR-1 (2026-10-19): DAWA (api.dataforsyningen.dk/adresser/autocomplete, /postnumre) svarer 410 Gone og er fjernet.
 * Opslag går nu gennem udbyder-abstraktionen i lib/address/provider.ts — slået fra (ADDRESS_LOOKUP_ENABLED=false)
 * indtil en afløser er besluttet og konfigureret. Uden udbyder: tomme forslag, manuel indtastning virker.
 */

import {
  getAddressProvider,
  ADDRESS_LOOKUP_MIN_QUERY_LENGTH,
  type AddressSuggestion,
  type AddressSearchOptions,
  type PostcodeInfo,
} from '@/lib/address/provider'
import { logger } from '@/lib/utils/logger'

export type { AddressSuggestion, PostcodeInfo }
export type SearchOptions = AddressSearchOptions
export { ADDRESS_LOOKUP_MIN_QUERY_LENGTH }

/** Er adresseopslag aktivt i dette miljø? (UI viser ellers "skriv adressen manuelt") */
export function isAddressLookupEnabled(): boolean {
  return getAddressProvider().enabled
}

/**
 * Søg danske adresser. Tom liste ved < 3 tegn, slået fra, fejl eller timeout — kalderen behandler det som "ingen forslag".
 */
export async function searchDanishAddresses(query: string, options: SearchOptions = {}): Promise<AddressSuggestion[]> {
  const trimmed = (query || '').trim()
  if (trimmed.length < ADDRESS_LOOKUP_MIN_QUERY_LENGTH) return []
  const provider = getAddressProvider()
  if (!provider.enabled) return []
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 20)
  try {
    return await provider.searchAddresses(trimmed, { limit, timeoutMs: options.timeoutMs ?? 5000 })
  } catch (err) {
    logger.warn('Adresseopslag fejlede', { metadata: { provider: provider.name }, error: err })
    return []
  }
}

/** Er postnummer → by aktivt? Samme flag som adresseforslag (PROD forbliver slået fra indtil staging er godkendt). */
export function isPostcodeLookupEnabled(): boolean {
  return process.env.ADDRESS_LOOKUP_ENABLED === 'true'
}

/**
 * Postnummer → by fra det importerede officielle DAR-datasæt (beslutning B — intet runtime-API). null ved slået fra,
 * ugyldigt eller ukendt postnummer (brugeren skriver byen selv; intet gæt).
 */
export async function lookupPostcode(postcode: string | null | undefined): Promise<PostcodeInfo | null> {
  const nr = String(postcode ?? '').trim()
  if (!/^\d{4}$/.test(nr) || !isPostcodeLookupEnabled()) return null
  const { cityForPostcodeLocal } = await import('@/lib/address/postcodes')
  const city = cityForPostcodeLocal(nr)
  return city ? { postalCode: nr, city } : null
}

/** Valgt forslag (id + type fra søgningen) → fulde felter via udbyderens opslag. null ved slået fra/fejl/ukendt. */
export async function resolveAddressSuggestion(id: string, kind: 'adresse' | 'husnummer'): Promise<AddressSuggestion | null> {
  const provider = getAddressProvider()
  if (!provider.enabled || !provider.resolveAddress) return null
  try {
    return await provider.resolveAddress(id, kind)
  } catch (err) {
    logger.warn('Adresseopslag (id) fejlede', { metadata: { provider: provider.name }, error: err })
    return null
  }
}
