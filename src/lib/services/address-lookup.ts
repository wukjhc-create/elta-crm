/**
 * Sprint 9D — Dansk adresse-lookup wrapper.
 *
 * Wrapper omkring Dataforsyningens DAWA autocomplete-API. UI maa ALDRIG
 * kalde DAWA direkte — gaa via /api/address/search der bruger denne
 * service. Saa kan vi senere skifte til en anden udbyder (fx
 * Datafordeleren) uden at roere UI'en.
 *
 * Bemaerkninger:
 *  - DAWA er gratis og kraever ikke API-key. Endpoint:
 *    https://api.dataforsyningen.dk/adresser/autocomplete
 *  - Server-side fetch saa timeouts og evt. fremtidig caching/rate-limit
 *    er centraliseret.
 */

import { logger } from '@/lib/utils/logger'

export interface AddressSuggestion {
  /** Mennesker-laesbar adresse — fx "Odinsvej 10, 4100 Ringsted". */
  label: string
  street: string
  houseNumber?: string
  floor?: string
  door?: string
  postalCode: string
  city: string
  /** Kommunekode fra DAWA (fx "0265" = Roskilde). Sjaeldent brugt. */
  municipality?: string
  latitude?: number
  longitude?: number
  /** DAWA adresse-id (fuld adresse). */
  dawaId?: string
  /** DAWA adgangsadresse-id (bygnings-niveau). */
  adgangsadresseId?: string
}

interface DawaAutocompleteResponse {
  tekst: string
  adresse: {
    id?: string
    adgangsadresseid?: string
    vejnavn: string
    husnr: string
    etage: string | null
    'dør'?: string | null
    /** dør med ASCII-fallback navn — afhaenger af DAWA version. */
    dor?: string | null
    postnr: string
    postnrnavn: string
    kommunekode?: string
    x?: number // longitude
    y?: number // latitude
  }
}

const DAWA_AUTOCOMPLETE = 'https://api.dataforsyningen.dk/adresser/autocomplete'
const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_LIMIT = 8
const MIN_QUERY_LENGTH = 3

export interface SearchOptions {
  /** Max antal forslag (default 8). */
  limit?: number
  /** Timeout i ms (default 5000). */
  timeoutMs?: number
}

/**
 * Soeg danske adresser. Returnerer tom liste ved < MIN_QUERY_LENGTH
 * tegn, fejl eller timeout — caller skal kunne haandtere det som
 * "ingen forslag" uden at crashe.
 */
export async function searchDanishAddresses(
  query: string,
  options: SearchOptions = {}
): Promise<AddressSuggestion[]> {
  const trimmed = (query || '').trim()
  if (trimmed.length < MIN_QUERY_LENGTH) return []

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), 20)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const url = `${DAWA_AUTOCOMPLETE}?q=${encodeURIComponent(trimmed)}&per_side=${limit}&fuzzy=`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      logger.warn('DAWA autocomplete returned non-OK', {
        metadata: { status: res.status, query: trimmed },
      })
      return []
    }
    const raw = (await res.json()) as DawaAutocompleteResponse[]
    if (!Array.isArray(raw)) return []
    return raw.map(normalizeAddressSuggestion).filter(Boolean) as AddressSuggestion[]
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      logger.warn('DAWA autocomplete timed out', {
        metadata: { query: trimmed, timeoutMs },
      })
    } else {
      logger.warn('DAWA autocomplete failed', {
        error: err instanceof Error ? err : new Error(String(err)),
      })
    }
    return []
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Konvertér én DAWA-row til vores stabile AddressSuggestion-form.
 * Eksporteret saa caller kan teste/transformere data der allerede er
 * hentet et andet sted (fx en fremtidig batch-importer).
 */
export function normalizeAddressSuggestion(raw: DawaAutocompleteResponse): AddressSuggestion | null {
  if (!raw || !raw.adresse) return null
  const a = raw.adresse
  if (!a.postnr || !a.postnrnavn || !a.vejnavn) return null

  const street = a.vejnavn.trim()
  const houseNumber = a.husnr?.trim() || undefined
  const floor = a.etage?.trim() || undefined
  const door = (a['dør'] ?? a.dor)?.trim() || undefined
  return {
    label: raw.tekst,
    street,
    houseNumber,
    floor,
    door,
    postalCode: a.postnr,
    city: a.postnrnavn,
    municipality: a.kommunekode || undefined,
    latitude: typeof a.y === 'number' ? a.y : undefined,
    longitude: typeof a.x === 'number' ? a.x : undefined,
    dawaId: a.id || undefined,
    adgangsadresseId: a.adgangsadresseid || undefined,
  }
}

export const ADDRESS_LOOKUP_MIN_QUERY_LENGTH = MIN_QUERY_LENGTH
