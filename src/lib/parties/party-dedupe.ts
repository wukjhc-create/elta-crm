/**
 * Parter fase B — ren normalisering til dublet-værn (ingen I/O). Bevidst IKKE 'use server'.
 *
 * Databasen er autoritativ (00255: party_normalize_name/_emails/_domains/_vat bruges af create_party/update_party).
 * Funktionerne her SPEJLER dem, så UI/server kan validere før kaldet; paritet bevises i `cli.ts party-00255-probe`
 * (samme input → samme output i SQL og TS).
 *
 * Gratis-/privatdomæner (gmail.com m.fl.) kan aldrig være et "verificeret domæne" — én liste i lib/email/free-mail-domains.
 */
import { isFreeMailDomain, isNonCustomerDomain } from '@/lib/email/free-mail-domains'

const UPPER = 'ÆØÅÄÖÜÉ'
const LOWER = 'æøåäöüé'

function translateDanish(s: string): string {
  let out = ''
  for (const ch of s) {
    const i = UPPER.indexOf(ch)
    out += i >= 0 ? LOWER[i] : ch
  }
  return out
}

/** = public.party_normalize_name: små bogstaver, kun a-z0-9æøåäöüé, mellemrum samlet, selskabsform til sidst fjernet. */
export function normalizePartyName(name: string | null | undefined): string | null {
  // SQL lower() i databasens locale rører kun ASCII pålideligt → ASCII-lowercase + eksplicit dansk oversættelse
  const lowered = translateDanish((name ?? '').replace(/[A-Z]/g, (c) => c.toLowerCase()))
  const spaced = lowered.replace(/[^a-z0-9æøåäöüé]+/g, ' ').replace(/^ +| +$/g, '')
  const stripped = (' ' + spaced).replace(/( (aps|ivs|as|a s|is|i s|ks|k s|ps|p s|amba|smba))+$/, '').replace(/^ +| +$/g, '')
  return stripped === '' ? null : stripped
}

const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

export interface NormalizedList {
  values: string[]
  invalid: string[]
}

/** = public.party_normalize_emails (ugyldige returneres separat; databasen afviser hele kaldet ved ugyldige). */
export function normalizePartyEmails(input: readonly string[] | null | undefined): NormalizedList {
  const values = new Set<string>()
  const invalid: string[] = []
  for (const raw of input ?? []) {
    const e = raw.trim().toLowerCase()
    if (e === '') continue
    if (EMAIL_RE.test(e) && !e.endsWith('@elta-crm.local')) values.add(e)
    else invalid.push(raw)
  }
  return { values: [...values].sort(), invalid }
}

/** = public.party_normalize_domains. Gratis-/privat- og egne domæner er ikke "verificeret domæne" (kun TS-laget afviser). */
export function normalizePartyDomains(input: readonly string[] | null | undefined): NormalizedList & { freeMail: string[] } {
  const values = new Set<string>()
  const invalid: string[] = []
  const freeMail: string[] = []
  for (const raw of input ?? []) {
    const d = raw.trim().toLowerCase().replace(/^@/, '').replace(/^www\./, '')
    if (d === '') continue
    if (!DOMAIN_RE.test(d) || d === 'elta-crm.local') invalid.push(raw)
    else if (isFreeMailDomain(d) || isNonCustomerDomain(d)) freeMail.push(d)
    else values.add(d)
  }
  return { values: [...values].sort(), invalid, freeMail }
}

/** = public.party_normalize_vat: kun cifre (8–14), valgfrit DK-præfiks. '' → null; ugyldig → 'invalid'. */
export function normalizePartyVat(input: string | null | undefined): string | null | 'invalid' {
  const v = (input ?? '').trim().toUpperCase().replace(/[\s.-]+/g, '').replace(/^DK/, '')
  if (v === '') return null
  return /^[0-9]{8,14}$/.test(v) ? v : 'invalid'
}

/** Paritets-fixtures (SQL ↔ TS) — bruges af party-00255-probe og party-phase-b-test. */
export const NAME_PARITY_SAMPLES: readonly string[] = [
  'Solar Partner ApS', 'SOLAR  partner a/s', 'Ærø El I/S', 'Østjysk Montage K/S', 'Atlas', 'Hansen AS', 'Nordic Amba',
  '  —  ', 'Jens Jensen', 'Café Måne ApS ApS', 'El-Service P/S', 'ABC IVS',
]
