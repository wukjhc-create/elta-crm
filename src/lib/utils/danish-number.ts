/**
 * Tolker tal skrevet i inputfelter, som en dansk bruger skriver dem.
 *
 *   "1.250"     → 1250     (punktum som tusindtalsseparator — før: 1,25 kr!)
 *   "1.234,56"  → 1234.56
 *   "1234,5"    → 1234.5
 *   "2.5"       → 2.5      (punktum som decimal når det ikke er 3-cifrede grupper)
 *   "1 250 kr"  → 1250
 *   "1,234.56"  → 1234.56  (engelsk format: sidste separator er punktum)
 *
 * Returnerer null ved tomt/ugyldigt input — kalderen afgør om 0 eller fejl.
 */
export function parseDanishDecimal(input: string | number | null | undefined): number | null {
  if (input == null) return null
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  let s = input.trim().replace(/\s| /g, '').replace(/kr\.?$/i, '').replace(/^kr\.?/i, '')
  if (s === '') return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot > lastComma) {
    // engelsk: "1,234.56"
    s = s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    // dansk: punktummer er tusindtal, komma er decimal
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // kun punktummer i 3-cifrede grupper: tusindtal ("1.250", "12.500.000")
    s = s.replace(/\./g, '')
  }

  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Drop-in for `Number(s.replace(',', '.'))` i formularer: samme semantik som
 * Number() (tom → 0, ugyldig → NaN), men dansk tolkning ("1.250" → 1250).
 */
export function toNumberDa(input: string | number | null | undefined): number {
  if (input == null) return 0
  if (typeof input === 'number') return input
  if (input.trim() === '') return 0
  return parseDanishDecimal(input) ?? NaN
}
