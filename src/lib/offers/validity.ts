/**
 * Tilbuds gyldighed — én regel for server og portal. "Gyldig til" er en dato og gælder HELE dagen i dansk tid.
 * (Tidligere: new Date(valid_until) < now → udløb kl. 02:00 dansk tid på sidste gyldige dag, og serveren tjekkede slet ikke.)
 */
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export function isOfferExpired(validUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!validUntil) return false
  const last = String(validUntil).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) return false
  return copenhagenParts(now).date > last
}

/** Kunden kan kun svare (acceptere/afvise) på et sendt/set tilbud der ikke er udløbet. */
export function canCustomerRespond(status: string | null | undefined, validUntil: string | null | undefined, now: Date = new Date()): boolean {
  return (status === 'sent' || status === 'viewed') && !isOfferExpired(validUntil, now)
}
