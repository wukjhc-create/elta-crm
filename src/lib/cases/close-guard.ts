/**
 * Lukke-værn: en sag lukkes ikke stille med ufaktureret arbejde. Serveren
 * afviser lukning med en fejl der starter med UNBILLED_PREFIX; UI'et viser
 * beskeden som bekræftelse og sender igen med acknowledgeUnbilled.
 */

export const UNBILLED_PREFIX = 'UNBILLED: '

export function isUnbilledCloseError(error: string | null | undefined): error is string {
  return !!error && error.startsWith(UNBILLED_PREFIX)
}

/** Klient: spørg brugeren. true = luk alligevel. */
export function confirmCloseDespiteUnbilled(error: string): boolean {
  if (typeof window === 'undefined') return false
  return window.confirm(`${error.slice(UNBILLED_PREFIX.length)}\n\nFakturér først (Fakturakladde), eller luk sagen alligevel?\n\nOK = luk alligevel`)
}
