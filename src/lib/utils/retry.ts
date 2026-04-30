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
  label = 'insert'
): Promise<UniqueViolationResult<T>> {
  let last: UniqueViolationResult<T> = { data: null, error: { code: 'no_attempt' } }
  for (let i = 0; i < maxAttempts; i++) {
    last = await attempt()
    if (!last.error) return last
    const isUniqueViolation =
      last.error.code === '23505' ||
      /duplicate|unique|already exists/i.test(last.error.message || '')
    if (!isUniqueViolation) return last
    if (i < maxAttempts - 1) {
      console.warn(`RETRY ${label} on 23505 (attempt ${i + 2}/${maxAttempts})`)
      await sleep(20 + Math.floor(Math.random() * 40))
    }
  }
  return last
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
