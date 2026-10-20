/**
 * Race-safe offer insert with the next TILBUD-YYYY-NNNN number.
 *
 * Same algorithm as the existing inline generators (auto-offer, offers, calculation-intelligence): read MAX+1 for
 * the current year and insert; on a 23505 (another writer took the number) re-read and retry. The UNIQUE constraint
 * offers_offer_number_key makes a duplicate number impossible. (The DB function generate_offer_number() is not
 * used: its SUBSTRING offset does not match the TILBUD-YYYY- prefix.)
 */

import { retryOnUniqueViolation, type UniqueViolationResult } from '@/lib/utils/retry'

/** FIN3-2: højeste løbenummer blandt rene numre (TILBUD-ÅÅÅÅ-NNNN) — revisioner (…-R2) og andre suffikser tæller ikke. */
export function maxOfferSequence(numbers: Array<string | null | undefined>, year: number | string): number {
  const re = new RegExp(`^TILBUD-${year}-(\\d+)$`)
  let max = 0
  for (const v of numbers) {
    const m = re.exec(String(v ?? ''))
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max
}

export async function nextOfferNumber(client: any, year?: number): Promise<string> {
  // FIN3-2 (finans-review 2026-10-20): dansk år (UTC-året gav forrige års præfiks kl. 00–01 nytårsnat)
  const { copenhagenParts } = await import('@/lib/utils/copenhagen-time')
  const y = year ?? Number(copenhagenParts(new Date()).date.slice(0, 4))
  const prefix = `TILBUD-${y}-`
  // FIN3-2: revisioner (TILBUD-ÅÅÅÅ-0042-R2) sorterede som tekst-maksimum → parseInt('R2') = NaN → næste nummer 0001
  // (findes) → alle 10 genforsøg samme nummer → ingen nye tilbud. Nu: revisioner udelades og det NUMERISKE maksimum
  // af de højeste rene numre bruges (tekstsortering holder for 4 cifre; flere cifre fanges af de 50 højeste)
  const { data } = await client
    .from('offers')
    .select('offer_number')
    .like('offer_number', `${prefix}%`)
    .not('offer_number', 'like', '%-R%')
    .order('offer_number', { ascending: false })
    .limit(50)
  const n = maxOfferSequence(((data ?? []) as Array<{ offer_number: string | null }>).map((r) => r.offer_number), y)
  return `${prefix}${(n + 1).toString().padStart(4, '0')}`
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
  // 00231 (Henrik 2026-10-15): tilbuddet arver kundens momsmode ved oprettelse (eksplicit, ingen gæt). Uden kunde
  // forbliver den tom og afgøres af kunden ved fakturering (lib/invoices/vat-guard.ts).
  if (row.vat_mode === undefined && typeof row.customer_id === 'string' && row.customer_id) {
    const { data: cust } = await client.from('customers').select('vat_mode').eq('id', row.customer_id).maybeSingle()
    const mode = (cust as { vat_mode?: string | null } | null)?.vat_mode
    if (mode) row = { ...row, vat_mode: mode }
  }
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
