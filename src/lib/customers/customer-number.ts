/**
 * Sprint 9E Phase 5d — Faelles customer_number-generator + insert-helper.
 *
 * EN logik til at generere customer_number og indsaette customers paa tvaers
 * af alle UI-flows + automation. Erstatter 5 duplikerede implementationer
 * (customers.ts, create-from-email.ts, /api/public/contact, offers.ts,
 * email-intelligence.ts).
 *
 * Format: C + 6-cifret nummer (C000001, C000002, ...).
 *
 * Race-handling: bruger eksisterende retryOnUniqueViolation-helper saa
 * unique violation paa customer_number forsoeges igen op til maxAttempts
 * gange med jitter. Hver attempt genberegner nummeret.
 *
 * Helperen er payload-agnostisk: caller leverer en buildPayload-funktion
 * der modtager det genererede nummer og returnerer det fulde insert-objekt.
 * Saa kan hver flow bevare egne tags/notes/created_by/defaults.
 */

import { retryOnUniqueViolation } from '@/lib/utils/retry'

const CUSTOMER_NUMBER_PREFIX = 'C'
const CUSTOMER_NUMBER_PADDING = 6
const DEFAULT_MAX_ATTEMPTS = 5

// Helper accepterer enhver Supabase-client (server, anon, admin). Vi bruger
// `any` her for at undgaa hard dependency paa @supabase/supabase-js i en
// ren utility — alle callers har deres egen client allerede.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientLike = any

/**
 * Generér naeste customer_number ved at slaa op paa eksisterende
 * C-prefixede numre. Defensiv mod ikke-standard formater.
 *
 * Note: ikke atomic — race-vinduet mellem SELECT og INSERT haandteres
 * af insertCustomerWithRetry. Brug aldrig denne funktion alene til
 * concurrent inserts.
 */
export async function generateNextCustomerNumber(
  supabase: SupabaseClientLike
): Promise<string> {
  const { data } = await supabase
    .from('customers')
    .select('customer_number')
    .like('customer_number', `${CUSTOMER_NUMBER_PREFIX}%`)
    .order('customer_number', { ascending: false })
    .limit(20)

  const rows = (data as Array<{ customer_number?: string | null }> | null) || []
  if (rows.length === 0) {
    return `${CUSTOMER_NUMBER_PREFIX}${'1'.padStart(CUSTOMER_NUMBER_PADDING, '0')}`
  }

  let maxNum = 0
  for (const row of rows) {
    const raw = row.customer_number
    if (!raw || raw.length < 2 || raw[0] !== CUSTOMER_NUMBER_PREFIX) continue
    const suffix = raw.substring(1)
    if (!/^\d+$/.test(suffix)) continue
    const n = parseInt(suffix, 10)
    if (Number.isFinite(n) && n > maxNum) maxNum = n
  }

  const nextNum = maxNum + 1
  return CUSTOMER_NUMBER_PREFIX + nextNum.toString().padStart(CUSTOMER_NUMBER_PADDING, '0')
}

export interface InsertCustomerWithRetryOptions {
  /** Max forsoeg ved 23505 unique violation. Default 5. */
  maxAttempts?: number
  /** PostgREST select-clause til at hente data tilbage. Default '*'. */
  selectClause?: string
  /** Label brugt i retry-log. Default 'customer_number'. */
  label?: string
}

/**
 * Indsaet en customer-row med automatisk customer_number-generation og
 * retry ved race-condition.
 *
 * Caller leverer:
 *  - supabase-client
 *  - buildPayload(customerNumber) — bygger insert-payload med det
 *    genererede nummer. Bevarer fleksibilitet for tags/notes/created_by/
 *    defaults pr. flow.
 *
 * Returnerer Supabase-style { data, error } saa caller kan haandtere
 * fejl og success ens.
 */
export async function insertCustomerWithRetry<TResult = unknown>(
  supabase: SupabaseClientLike,
  buildPayload: (customerNumber: string) => Record<string, unknown>,
  options?: InsertCustomerWithRetryOptions
): Promise<{ data: TResult | null; error: { code?: string; message?: string } | null }> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const selectClause = options?.selectClause ?? '*'
  const label = options?.label ?? 'customer_number'

  return retryOnUniqueViolation<TResult>(async () => {
    const customerNumber = await generateNextCustomerNumber(supabase)
    const payload = buildPayload(customerNumber)
    const result = await supabase
      .from('customers')
      .insert(payload)
      .select(selectClause)
      .single()
    return result as { data: TResult | null; error: { code?: string; message?: string } | null }
  }, maxAttempts, label)
}
