/**
 * retryOnUniqueViolation
 *
 * Retries a Supabase mutation when a 23505 (unique_violation) is hit —
 * used for race-prone monotonic number generation (customer_number, offer_number).
 *
 * The factory function is responsible for re-reading state (e.g. MAX(...)+1)
 * and producing a fresh insert payload on each attempt.
 */

export interface UniqueViolationResult<T> {
  data: T | null
  error: { code?: string; message?: string } | null
}

export async function retryOnUniqueViolation<T>(
  attempt: () => Promise<UniqueViolationResult<T>>,
  maxAttempts = 3,
  label = 'insert',
  /** Valgfrit filter: kun disse unique-fejl forsoeges igen (fx kun nummer-constraintet, ikke en dedup-noegle). */
  isRetryable?: (error: { code?: string; message?: string }) => boolean
): Promise<UniqueViolationResult<T>> {
  let last: UniqueViolationResult<T> = { data: null, error: { code: 'no_attempt' } }
  for (let i = 0; i < maxAttempts; i++) {
    last = await attempt()
    if (!last.error) return last
    const isUniqueViolation =
      last.error.code === '23505' ||
      /duplicate|unique|already exists/i.test(last.error.message || '')
    if (!isUniqueViolation) return last
    if (isRetryable && !isRetryable(last.error)) return last
    if (i < maxAttempts - 1) {
      console.warn(`RETRY ${label} on 23505 (attempt ${i + 2}/${maxAttempts})`)
      // Backoff med fuld jitter: jo flere samtidige skribenter, jo mere spredes de (P1 #7 race-test).
      await sleep(Math.floor(Math.random() * Math.min(400, 25 * 2 ** i)) + 5)
    }
  }
  return last
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
