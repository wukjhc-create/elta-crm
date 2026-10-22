/**
 * IV2-4 (Henrik 2026-10-19): kontraktsummen er faktureringsgrundlaget (ekskl. moms). Ændres den, når sagen er oprettet fra
 * et accepteret tilbud eller der allerede er faktureret, skal brugeren bekræfte — serveren afviser med CONTRACT_PREFIX,
 * UI'et spørger og sender igen med acknowledgeContractChange. Ændringen auditeres altid.
 */
export const CONTRACT_PREFIX = 'CONTRACT: '

export function isContractChangeError(error: string | null | undefined): error is string {
  return !!error && error.startsWith(CONTRACT_PREFIX)
}

/** Klient: spørg brugeren. true = gem alligevel. */
export function confirmContractChange(error: string): boolean {
  if (typeof window === 'undefined') return false
  return window.confirm(`${error.slice(CONTRACT_PREFIX.length)}\n\nOK = gem ændringen`)
}
