import { createHash, timingSafeEqual } from 'crypto'

/**
 * API-3 (review 2026-10-17): tidskonstant sammenligning af hemmeligheder uden RangeError.
 * `a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))` kastede, når en header med samme
 * tegn-længde indeholdt ikke-ASCII-tegn (forskellig byte-længde) → 500 + fejlrække i system_health_log for anonyme
 * kald. Her sammenlignes SHA-256 af begge (altid 32 byte) — kaster aldrig og lækker ikke længden.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest()
  const hb = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(ha, hb)
}
