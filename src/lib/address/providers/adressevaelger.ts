/**
 * ADDR-1 (Henrik 2026-10-19, beslutning A): Adressevælgeren (Klimadatastyrelsen) — officiel afløser for DAWA Autocomplete.
 *   Søgning: GET https://adressevaelger.dk/adresser/soeg?tekst=…&maksimum=N&token=…  → { fund: [{ type, id, titel, … }] }
 *   Opslag:  GET /adresser/{id} (enhed med etage/dør) eller /husnumre/{id} (adgangsadresse) → postnummer, vejnavn,
 *            husnummertekst, etage/dør, kommune og adgangspunkt i EPSG:25832 (konverteres til WGS84 her).
 * Token: ADDRESS_LOOKUP_TOKEN (kun serverside). KDS har endnu ingen brugerregistrering; tokenet er en projektspecifik
 * tilfældig streng, der udskiftes når registreringen åbner. Kendte fejl hos udbyderen: "oe/ae/aa" matches ikke ø/æ/å, og
 * manglende mellemrum efter komma bryder søgningen — begge håndteres i forespørgslen. Fejl/timeout → tomme svar.
 * Bevidst IKKE 'use server'.
 */
import type { AddressSearchProvider, AddressSuggestion, AddressSearchOptions, PostcodeInfo } from '@/lib/address/provider'
import { utm32ToWgs84 } from '@/lib/address/utm32'

const BASE = 'https://adressevaelger.dk'
const DEFAULT_TIMEOUT_MS = 4000

type Fund = { type?: string; id?: string; titel?: string; husnummerId?: string; vejnavn?: string; husnummer?: string }

/** Udbyderens kendte fejl: mellemrum efter komma (ellers brydes søgningen). Ingen andre ændringer af brugerens tekst. */
export function normalizeQuery(q: string): string {
  return q.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim()
}

/** "oe/ae/aa" → ø/æ/å (kun som 2. forsøg ved 0 fund — brugeren vælger selv blandt forslagene) */
export function danishLetterVariant(q: string): string | null {
  const v = q.replace(/aa/g, 'å').replace(/Aa/g, 'Å').replace(/oe/g, 'ø').replace(/Oe/g, 'Ø').replace(/ae/g, 'æ').replace(/Ae/g, 'Æ')
  return v !== q ? v : null
}

/** Foreløbig opdeling af titlen ("Nørrebrogade 20, 2., 2200 København N") — de endelige felter kommer fra opslaget. */
export function parseTitle(titel: string): { street: string; houseNumber?: string; floorDoor?: string; postalCode: string; city: string } | null {
  const parts = titel.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const last = /^(\d{4})\s+(.+)$/.exec(parts[parts.length - 1])
  if (!last) return null
  const sm = /^(.*?)\s+(\d+[A-Za-z]?)$/.exec(parts[0])
  return {
    street: sm ? sm[1] : parts[0],
    houseNumber: sm ? sm[2] : undefined,
    floorDoor: parts.length > 2 ? parts.slice(1, -1).join(', ') : undefined,
    postalCode: last[1],
    city: last[2],
  }
}

async function getJson(path: string, token: string, timeoutMs: number): Promise<unknown | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const sep = path.includes('?') ? '&' : '?'
    const res = await fetch(`${BASE}${path}${sep}token=${encodeURIComponent(token)}`, { signal: ctrl.signal, headers: { Accept: 'application/json' }, cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function suggestionFromFund(f: Fund): AddressSuggestion | null {
  if (!f || !f.id || !f.titel || (f.type !== 'adresse' && f.type !== 'husnummer')) return null
  const p = parseTitle(f.titel)
  if (!p) return null
  return { label: f.titel, street: p.street, houseNumber: p.houseNumber, postalCode: p.postalCode, city: p.city, id: f.id, kind: f.type, resolved: false }
}

type Husnummer = {
  id_lokalid?: string; husnummertekst?: string; vejnavn?: string; adgangsadressebetegnelse?: string
  adgangspunkt?: { koordinater?: { x?: number; y?: number } }
  postnummer?: { postnr?: string; navn?: string }
  navngivenvejkommunedel?: { kommune?: string }
}
type Adresse = { id_lokalid?: string; adressebetegnelse?: string; etagebetegnelse?: string | null; doerbetegnelse?: string | null; husnummer?: Husnummer }

/** Opslagets svar ({ adresse } eller { husnummer }) → vores stabile form; null hvis ufuldstændigt. */
export function normalizeAdressevaelger(raw: unknown): AddressSuggestion | null {
  const r = (raw ?? {}) as { adresse?: Adresse; husnummer?: Husnummer }
  const adr = r.adresse
  const hus = adr?.husnummer ?? r.husnummer
  if (!hus) return null
  const street = String(hus.vejnavn ?? '').trim()
  const postalCode = String(hus.postnummer?.postnr ?? '').trim()
  const city = String(hus.postnummer?.navn ?? '').trim()
  if (!street || !/^\d{4}$/.test(postalCode) || !city) return null
  const xy = hus.adgangspunkt?.koordinater
  const geo = xy && typeof xy.x === 'number' && typeof xy.y === 'number' ? utm32ToWgs84(xy.x, xy.y) : null
  return {
    label: String(adr?.adressebetegnelse ?? hus.adgangsadressebetegnelse ?? `${street} ${hus.husnummertekst ?? ''}, ${postalCode} ${city}`).trim(),
    street,
    houseNumber: hus.husnummertekst?.trim() || undefined,
    floor: adr?.etagebetegnelse?.trim() || undefined,
    door: adr?.doerbetegnelse?.trim() || undefined,
    postalCode,
    city,
    municipality: hus.navngivenvejkommunedel?.kommune || undefined,
    latitude: geo?.latitude,
    longitude: geo?.longitude,
    id: adr?.id_lokalid ?? hus.id_lokalid,
    kind: adr ? 'adresse' : 'husnummer',
    resolved: true,
    dawaId: adr?.id_lokalid || undefined,
    adgangsadresseId: hus.id_lokalid || undefined,
  }
}

export function createAdressevaelgerProvider(token: string): AddressSearchProvider {
  return {
    name: 'adressevaelger',
    enabled: true,
    async searchAddresses(query: string, options: AddressSearchOptions = {}): Promise<AddressSuggestion[]> {
      const limit = Math.min(Math.max(options.limit ?? 8, 1), 20)
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const run = async (q: string) => {
        const json = (await getJson(`/adresser/soeg?tekst=${encodeURIComponent(q)}&maksimum=${limit}`, token, timeoutMs)) as { fund?: Fund[] } | null
        return (json?.fund ?? []).map(suggestionFromFund).filter((s): s is AddressSuggestion => !!s)
      }
      const q = normalizeQuery(query)
      let out = await run(q)
      if (out.length === 0) {
        const v = danishLetterVariant(q)
        if (v) out = await run(v)
      }
      return out.slice(0, limit)
    },
    async resolveAddress(id: string, kind: 'adresse' | 'husnummer'): Promise<AddressSuggestion | null> {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null
      const json = await getJson(`/${kind === 'husnummer' ? 'husnumre' : 'adresser'}/${id}`, token, DEFAULT_TIMEOUT_MS)
      return normalizeAdressevaelger(json)
    },
    // Postnummer → by kommer fra det importerede officielle DAR-datasæt (beslutning B), ikke fra denne udbyder
    async lookupPostcode(): Promise<PostcodeInfo | null> { return null },
    normalizeAddress: normalizeAdressevaelger,
  }
}
