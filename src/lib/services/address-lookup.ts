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

/** Postnummer → by (kun fra en konfigureret udbyder; aldrig gæt). null ved slået fra/ukendt/fejl. */
export async function lookupPostcode(postcode: string | null | undefined): Promise<PostcodeInfo | null> {
  const nr = String(postcode ?? '').trim()
  if (!/^\d{4}$/.test(nr)) return null
  const provider = getAddressProvider()
  if (!provider.enabled) return null
  try {
    return await provider.lookupPostcode(nr)
  } catch (err) {
    logger.warn('Postnummeropslag fejlede', { metadata: { provider: provider.name }, error: err })
    return null
  }
}
