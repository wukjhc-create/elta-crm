/**
 * GP-13 (grossist-review 2026-10-14): deterministisk talparser til prisfiler — gætter aldrig.
 * Ren logik, bevidst IKKE 'use server'.
 *
 * Regler (efter fjernelse af mellemrum/hårde mellemrum mellem cifre og et evt. "kr"/"DKK"):
 *  - tom → { ok:false, reason:'empty' }
 *  - både "," og "." → det SIDSTE tegn er decimaltegnet, det andet tusindtalsseparator (grupper á 3 valideres):
 *      "1.234,56" → 1234.56 · "1,234.56" → 1234.56
 *  - flere af samme tegn i 3-cifrede grupper → tusindtal: "1.234.567" / "1,234,567" → 1234567
 *  - ét tegn med 1–2 cifre efter → decimal: "1234,56" / "1234.56" / "12,5"
 *  - ét tegn med PRÆCIS 3 cifre efter ("1.234" / "1,234") er tvetydigt → afgøres KUN af filens decimaltegn (hint);
 *    uden hint → { ok:false, reason:'ambiguous' } (sendes til kontrol, gættes ikke)
 *  - alt andet (bogstaver, flere decimaltegn, "12abc") → { ok:false, reason:'invalid' }
 */

export type DecimalSeparator = ',' | '.'

export type PriceParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'invalid' | 'ambiguous'; raw: string }

const round = (n: number) => Math.round(n * 1e6) / 1e6

export function parsePrice(input: string | number | null | undefined, decimalHint?: DecimalSeparator | null): PriceParseResult {
  if (typeof input === 'number') return Number.isFinite(input) ? { ok: true, value: input } : { ok: false, reason: 'invalid', raw: String(input) }
  const raw = (input ?? '').toString()
  let s = raw.trim()
  if (!s) return { ok: false, reason: 'empty', raw }
  s = s.replace(/\s*(kr\.?|dkk)\s*$/i, '').replace(/^(kr\.?|dkk)\s*/i, '')
  s = s.replace(/(\d)[\s  ]+(?=\d)/g, '$1').trim()
  let sign = 1
  if (/^-/.test(s)) { sign = -1; s = s.slice(1) } else if (/-$/.test(s)) { sign = -1; s = s.slice(0, -1) }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return { ok: false, reason: 'invalid', raw }

  const commas = (s.match(/,/g) ?? []).length
  const dots = (s.match(/\./g) ?? []).length
  const toNum = (intPart: string, frac: string | null) => {
    if (!/^\d+$/.test(intPart) || (frac !== null && !/^\d+$/.test(frac))) return null
    return sign * Number(frac !== null ? `${intPart}.${frac}` : intPart)
  }
  const grouped = (s2: string, sep: string) => new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(s2)

  if (commas === 0 && dots === 0) {
    const v = toNum(s, null)
    return v === null ? { ok: false, reason: 'invalid', raw } : { ok: true, value: v }
  }

  if (commas > 0 && dots > 0) {
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.'
    const thou = dec === ',' ? '.' : ','
    const idx = s.lastIndexOf(dec)
    const intPart = s.slice(0, idx)
    const frac = s.slice(idx + 1)
    if (intPart.includes(dec) || !grouped(intPart, thou) || frac.length === 0) return { ok: false, reason: 'invalid', raw }
    const v = toNum(intPart.split(thou).join(''), frac)
    return v === null ? { ok: false, reason: 'invalid', raw } : { ok: true, value: round(v) }
  }

  const sep = commas > 0 ? ',' : '.'
  const count = commas + dots
  if (count > 1) {
    if (!grouped(s, sep)) return { ok: false, reason: 'invalid', raw }
    const v = toNum(s.split(sep).join(''), null)
    return v === null ? { ok: false, reason: 'invalid', raw } : { ok: true, value: v }
  }

  const [intPart, frac] = s.split(sep)
  if (!intPart || !frac) return { ok: false, reason: 'invalid', raw }
  if (frac.length === 3 && intPart.length <= 3) {
    // "1.234" / "1,234": tusindtal ELLER 3 decimaler — kun filens decimaltegn kan afgøre det
    if (!decimalHint) return { ok: false, reason: 'ambiguous', raw }
    const v = decimalHint === sep ? toNum(intPart, frac) : toNum(`${intPart}${frac}`, null)
    return v === null ? { ok: false, reason: 'invalid', raw } : { ok: true, value: round(v) }
  }
  if (frac.length > 3) {
    // "1,2345" — kun meningsfuldt som decimaltegn
    const v = toNum(intPart, frac)
    return v === null ? { ok: false, reason: 'invalid', raw } : { ok: true, value: round(v) }
  }
  if (frac.length === 3) {
    // "12.345" med ≥4 cifre før kan ikke være tusindtal i korrekt gruppering ("1234.567") → decimal
    const v = toNum(intPart, frac)
    return v === null ? { ok: false, reason: 'invalid', raw } : { ok: true, value: round(v) }
  }
  const v = toNum(intPart, frac)
  return v === null ? { ok: false, reason: 'invalid', raw } : { ok: true, value: round(v) }
}

/**
 * Filens decimaltegn ud fra prisværdierne: et tegn efterfulgt af 1–2 cifre til sidst ("12,50" / "12.50") er entydigt.
 * Blandede filer eller ingen entydige værdier → null (tvetydige værdier sendes så til kontrol).
 */
export function detectDecimalSeparator(samples: Array<string | null | undefined>): DecimalSeparator | null {
  let comma = 0
  let dot = 0
  for (const raw of samples) {
    const s = (raw ?? '').toString().trim().replace(/\s*(kr\.?|dkk)\s*$/i, '')
    if (!s) continue
    if (/,\d{1,2}$/.test(s) || /\.\d{3},\d+$/.test(s)) comma++
    else if (/\.\d{1,2}$/.test(s) || /,\d{3}\.\d+$/.test(s)) dot++
  }
  if (comma > 0 && dot === 0) return ','
  if (dot > 0 && comma === 0) return '.'
  return null
}

export function priceIssueText(field: string, r: Extract<PriceParseResult, { ok: false }>): string {
  return r.reason === 'ambiguous'
    ? `Tvetydig ${field} "${r.raw}" — kan være tusindtal eller decimaler; kontrollér filens talformat`
    : `Ugyldig ${field} "${r.raw}"`
}
