/**
 * Race-safe offer insert with the next TILBUD-YYYY-NNNN number.
 *
 * Same algorithm as the existing inline generators (auto-offer, offers, calculation-intelligence): read MAX+1 for
 * the current year and insert; on a 23505 (another writer took the number) re-read and retry. The UNIQUE constraint
 * offers_offer_number_key makes a duplicate number impossible. (The DB function generate_offer_number() is not
 * used: its SUBSTRING offset does not match the TILBUD-YYYY- prefix.)
 */

import { retryOnUniqueViolation, type UniqueViolationResult } from '@/lib/utils/retry'

export async function nextOfferNumber(client: any, year = new Date().getFullYear()): Promise<string> {
  const prefix = `TILBUD-${year}-`
  const { data } = await client
    .from('offers')
    .select('offer_number')
    .like('offer_number', `${prefix}%`)
    .order('offer_number', { ascending: false })
    .limit(1)
  const last = (data?.[0]?.offer_number as string | undefined) ?? null
  const n = last ? parseInt(last.split('-').pop() || '0', 10) : 0
  return `${prefix}${((Number.isNaN(n) ? 0 : n) + 1).toString().padStart(4, '0')}`
}

/**
 * Max forsoeg ved nummer-kollision. Hver runde vinder mindst én samtidig skribent, saa N forsoeg daekker N
 * samtidige oprettelser; 10 er rigeligt til pilotens belastning (verificeret: harness:concurrency C4, 8 parallelle).
 */
export const OFFER_NUMBER_MAX_ATTEMPTS = 10

/**
 * Kun kollision paa offers_offer_number_key forsoeges igen. Andre unique-constraints (source_email_id,
 * uq_offers_open_proposal_per_source_case) er dedup-noegler: dér skal kalderen straks have 23505 og hente vinderen.
 */
export function isOfferNumberCollision(error: { message?: string }): boolean {
  return /offer_number/i.test(error.message || '')
}

/** Insert an offer row (without offer_number) with a fresh number; retries on number collisions. */
export async function insertOfferWithNumber<T extends { id: string; offer_number: string } = { id: string; offer_number: string }>(
  client: any,
  row: Record<string, unknown>,
  select = 'id, offer_number',
): Promise<UniqueViolationResult<T>> {
  return retryOnUniqueViolation<T>(
    async () =>
      client
        .from('offers')
        .insert({ ...row, offer_number: await nextOfferNumber(client) })
        .select(select)
        .single(),
    OFFER_NUMBER_MAX_ATTEMPTS,
    'offer_number',
    isOfferNumberCollision,
  )
}
