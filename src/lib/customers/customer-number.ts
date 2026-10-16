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
import { logger } from '@/lib/utils/logger'
import { escapeLike } from '@/lib/validations/postgrest-filter'
import {
  DUPLICATE_EMAIL_CODE,
  duplicateEmailMessage,
  findCustomerByEmail,
  isPlaceholderEmail,
  normalizeCustomerEmail,
  type ExistingCustomerRef,
} from '@/lib/customers/customer-email'

const CUSTOMER_NUMBER_PREFIX = 'C'
const CUSTOMER_NUMBER_PADDING = 6
// Hver runde vinder mindst én samtidig skribent (harness:concurrency C6: 8 parallelle).
const DEFAULT_MAX_ATTEMPTS = 10

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
  /**
   * T-5 (review 2026-10-16): server-side dublet-værn på e-mail. Standard: en kunde med samme (normaliserede) mail
   * findes → intet insert, fejlkode DUPLICATE_EMAIL (+ den eksisterende kunde). true = brugerens eksplicitte
   * "Opret alligevel". Pladsholdere ('' / auto+…@elta-crm.local) tæller aldrig som dublet.
   */
  allowDuplicateEmail?: boolean
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
): Promise<{ data: TResult | null; error: { code?: string; message?: string; existing?: ExistingCustomerRef } | null }> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const explicitSelectClause = options?.selectClause
  const label = options?.label ?? 'customer_number'
  const allowDup = options?.allowDuplicateEmail === true

  // T-5: mailen normaliseres (trim + små bogstaver) og tjekkes FØR nummer-generering/insert
  const probeEmail = normalizeCustomerEmail(buildPayload('PROBE').email as string | null | undefined)
  if (!allowDup && !isPlaceholderEmail(probeEmail)) {
    const existing = await findCustomerByEmail(supabase, probeEmail)
    if (existing) {
      return { data: null, error: { code: DUPLICATE_EMAIL_CODE, message: duplicateEmailMessage(probeEmail, existing), existing } }
    }
  }

  const result = await retryOnUniqueViolation<TResult>(async () => {
    const customerNumber = await generateNextCustomerNumber(supabase)
    const payload = buildPayload(customerNumber)
    if (typeof payload.email === 'string') payload.email = normalizeCustomerEmail(payload.email)

    // Bugfix Sprint 9E Phase 5d-fix: brug .select() UDEN argument som
    // default — matcher Phase 5a-c-mønsteret. Caller kan stadig
    // explicit angive selectClause hvis de kun vil have specifikke
    // kolonner. Eksplicit destructuring i stedet for cast af hele
    // result-objektet sikrer at vi ikke maskerer en runtime-fejl.
    const insertQuery = supabase.from('customers').insert(payload)
    const { data, error } = explicitSelectClause
      ? await insertQuery.select(explicitSelectClause).single()
      : await insertQuery.select().single()

    // Defensiv validering: hvis insert lykkes men data mangler eller
    // mangler id, log tydeligt — det maa aldrig ske, men giver os
    // signal hvis Supabase-clienten en dag aendrer return-shape.
    if (!error && (!data || typeof data !== 'object' || !('id' in data))) {
      logger.error('insertCustomerWithRetry unexpected data shape', {
        metadata: {
          label,
          customer_number: customerNumber,
          data_type: typeof data,
          data_is_null: data === null,
        },
      })
    }

    return {
      data: (data as TResult | null) ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error: (error as any) ?? null,
    }
  }, maxAttempts, label, (e) => /customer_number/i.test(e.message || ''))

  // T-5 race (uden unikt indeks): to samtidige oprettelser kan begge passere forhåndstjekket. Den ÆLDSTE række
  // (created_at, id) vinder deterministisk; den netop indsatte slettes igen, hvis en ældre findes — så præcis én
  // overlever, også når begge parter tjekker samtidig. (Fuld garanti: indeks 00237, BLOCKED_APPROVAL.)
  const newId = (result.data as { id?: string } | null)?.id
  if (!allowDup && newId && !result.error && !isPlaceholderEmail(probeEmail)) {
    try {
      const { data: same } = await supabase
        .from('customers')
        .select('id, company_name, customer_number, is_active, created_at')
        .ilike('email', escapeLike(probeEmail))
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(5)
      const rows = (same ?? []) as Array<ExistingCustomerRef & { created_at: string }>
      const winner = rows[0]
      if (winner && winner.id !== newId) {
        // RLS: kun admin må slette kunder — den netop oprettede række (præcis dette id) fjernes med admin-klienten,
        // ellers ville oprydningen fejle tavst for salg/serviceleder, og begge dubletter blive stående
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const { error: delErr } = await createAdminClient().from('customers').delete().eq('id', newId)
        if (delErr) {
          logger.error('insertCustomerWithRetry: samtidig dublet kunne ikke fjernes', { error: delErr, metadata: { label, newId } })
          return result
        }
        logger.warn('insertCustomerWithRetry: samtidig dublet fjernet', { metadata: { label, kept: winner.id, removed: newId } })
        return { data: null, error: { code: DUPLICATE_EMAIL_CODE, message: duplicateEmailMessage(probeEmail, winner), existing: winner } }
      }
    } catch (raceErr) {
      logger.warn('insertCustomerWithRetry: dublet-genkontrol fejlede (kunden er oprettet)', { error: raceErr })
    }
  }
  return result
}
