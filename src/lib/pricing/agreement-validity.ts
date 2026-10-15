/**
 * GP-2 (grossist-review 2026-10-14): kundeaftaler (customer_supplier_prices / customer_product_prices) gælder kun i
 * deres gyldighedsperiode (valid_from/valid_to, København-dato). Fælles filter, så alle prisstier er enige.
 * Bevidst IKKE 'use server'.
 */
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

type OrFilterable<T> = { or: (filter: string) => T }

export function onlyValidAgreements<T extends OrFilterable<T>>(q: T, now: Date = new Date()): T {
  const today = copenhagenParts(now).date
  return q.or(`valid_from.is.null,valid_from.lte.${today}`).or(`valid_to.is.null,valid_to.gte.${today}`)
}
