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

/**
 * O-12 (review 2026-10-16): fælles portal-regel for accept OG afvis — hvorfor kunden ikke kan svare (null = må svare).
 * Et udløbet, afløst eller allerede besvaret tilbud kan ikke ændres via en gammel portal-session.
 */
export function portalResponseBlockReason(
  status: string | null | undefined,
  validUntil: string | null | undefined,
  superseded: boolean,
  action: 'accept' | 'reject',
  now: Date = new Date(),
): string | null {
  if (status === 'accepted') return 'Tilbuddet er allerede accepteret'
  if (status === 'rejected') return 'Tilbuddet er allerede afvist'
  if (status !== 'sent' && status !== 'viewed') return action === 'accept' ? 'Tilbuddet kan ikke accepteres i denne status' : 'Tilbuddet kan ikke afvises i denne status'
  if (isOfferExpired(validUntil, now)) return 'Tilbuddet er udløbet — kontakt os for et nyt tilbud'
  if (superseded) return 'Tilbuddet er erstattet af en nyere version — genindlæs siden'
  return null
}

/** Tilbud ude i den viste liste: sendt eller set, og stadig inden for gyldig til. Ingen ny status. */
export function countOffersOut(
  offers: ReadonlyArray<{ status?: string | null; valid_until?: string | null }>,
  now: Date = new Date(),
): number {
  let n = 0
  for (const offer of offers) {
    if (canCustomerRespond(offer.status, offer.valid_until, now)) n += 1
  }
  return n
}
