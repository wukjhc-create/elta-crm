/**
 * Telefonnumre — KANONISK normalisering (AI-receptionist fase 2 samlede tre parallelle hjælpere her).
 *
 *  - canonicalPhone:     match-nøgle. Landekode + nummer uden '+'/'00' ('4520345678'). Danske 8-cifrede numre får '45'.
 *                        Bruges af identitets-matcheren, telefoni (Relatel-format) og opkaldsopslag.
 *  - samePhone:          er to numre det samme (begge normaliseres; ubrugelige numre matcher aldrig).
 *  - localPhoneDigits:   dansk lokal-nøgle (8 cifre uden 45/0045) — import-/dubletnøgle for CSV og leads.
 *  - normalizeDanishPhone: SKRIVE-format (bevarer '+'); uændret adfærd — gemte numre skifter ikke form.
 *
 * Et telefonnummer IDENTIFICERER højst en CRM-kandidat. Det autentificerer ALDRIG en opkalder (kan forfalskes).
 * Rene funktioner — bevidst IKKE 'use server'.
 */

/** Match-nøgle (= Relatel-format). null hvis det ikke er et brugbart nummer (under 8 eller over 15 cifre). */
export function canonicalPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = String(raw).trim()
  let digits = trimmed.replace(/[^0-9]/g, '')
  if (!digits) return null
  if (trimmed.startsWith('+')) {
    // international form: cifrene er allerede landekode + nummer
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2)
  } else if (digits.length === 8) {
    digits = `45${digits}`
  }
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}

/** Samme nummer? (begge normaliseres; ubrugelige numre matcher aldrig) */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = canonicalPhone(a)
  return !!x && x === canonicalPhone(b)
}

/** Dansk lokal-nøgle: kun cifre, uden 45/0045-præfiks foran et 8-cifret nummer ('' hvis intet). */
export function localPhoneDigits(raw: string | null | undefined): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (/^0045\d{8}$/.test(d)) return d.slice(4)
  if (/^45\d{8}$/.test(d)) return d.slice(2)
  return d
}

/**
 * SKRIVE-format: fjerner alt andet end cifre og '+'. Uændret siden før fase 2.
 *   "+45 20 34 56 78" → "+4520345678" · "(20) 34 56 78" → "20345678"
 */
export function normalizeDanishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^+0-9]/g, '')
  if (!digits) return null
  return digits
}

/** Ligner et brugbart DK-nummer (>= 8 cifre)? */
export function isPlausibleDkPhone(raw: string | null | undefined): boolean {
  const n = normalizeDanishPhone(raw)
  if (!n) return false
  const digits = n.replace(/\D/g, '')
  return digits.length >= 8
}
