/**
 * Phone normalization for Danish phone numbers.
 *
 * Strips all non-digit/plus characters. Used both at write-time and at
 * match-time so equality comparisons are reliable regardless of format.
 *
 * Examples:
 *   "+45 20 34 56 78" → "+4520345678"
 *   "(20) 34 56 78"   → "20345678"
 *   "20-34-56-78"     → "20345678"
 */

export function normalizeDanishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^+0-9]/g, '')
  if (!digits) return null
  return digits
}

/**
 * Returns true if the value looks like a usable DK phone (>=8 digits).
 */
export function isPlausibleDkPhone(raw: string | null | undefined): boolean {
  const n = normalizeDanishPhone(raw)
  if (!n) return false
  const digits = n.replace(/\D/g, '')
  return digits.length >= 8
}
