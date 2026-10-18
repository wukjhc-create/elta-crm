/**
 * Tolker tal skrevet i inputfelter, som en dansk bruger skriver dem. DEN fælles parser for økonomi-/kalkulationsinput
 * (TZ-1/TZ-2, format-review 2026-10-18) — ingen lokale parseFloat/replace-varianter i den slags felter.
 *
 *   "1.250"        → 1250     (punktum som tusindtalsseparator — før: 1,25 kr!)
 *   "1.234,56"     → 1234.56
 *   "1234,5"       → 1234.5
 *   "2.5"          → 2.5      (punktum som decimal når det ikke er 3-cifrede grupper)
 *   "1 250 kr"     → 1250
 *   "DKK 1.250,00" → 1250
 *   "−1.234,56"    → -1234.56 (også typografisk minus)
 *   "1,234.56"     → 1234.56  (eksplicit engelsk format: begge separatorer, sidste er punktum)
 *   "1234.56"      → 1234.56
 *
 * Returnerer null ved tomt, ugyldigt eller tvetydigt input (fx "1.23.4", "12,5,6", "1e5") — ALDRIG et stille 0.
 * Kalderen afgør, om null er en fejl eller "felt ryddet".
 *
 * Bemærk: import-specifikke regler (prisfiler, PDF-fakturaer) har egne parsere (import-engine.ts parseDanishNumber,
 * incoming-invoice-parser.ts) og bruger ikke denne.
 */
export function parseDanishDecimal(input: string | number | null | undefined): number | null {
  if (input == null) return null
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  let s = input
    .trim()
    .replace(/[\s  ]/g, '')
    .replace(/^(?:kr\.?|dkk)/i, '')
    .replace(/(?:kr\.?|dkk|,-)$/i, '')
    .replace(/^[−–]/, '-')
  if (s === '' || s === '-') return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot > lastComma) {
    // engelsk: "1,234.56" — kommaerne skal være 3-cifrede tusindtalsgrupper
    if (!/^-?\d{1,3}(,\d{3})+\.\d+$/.test(s)) return null
    s = s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    // dansk: punktummer er tusindtal (i 3-cifrede grupper), ét komma er decimal
    if (lastDot >= 0 && !/^-?\d{1,3}(\.\d{3})+,\d*$/.test(s)) return null
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
 * Drop-in for `Number(s.replace(',', '.'))` i formularer med dansk tolkning ("1.250" → 1250).
 * TZ-1/TZ-2 (2026-10-18): tomt felt → NaN (før 0) — et tomt beløbsfelt må ikke lydløst blive 0 kr. Kalderen
 * tjekker Number.isFinite og viser en fejl; felter hvor tomt betyder "intet" tjekker selv for tom streng først.
 */
export function toNumberDa(input: string | number | null | undefined): number {
  if (input == null) return NaN
  if (typeof input === 'number') return input
  return parseDanishDecimal(input) ?? NaN
}
