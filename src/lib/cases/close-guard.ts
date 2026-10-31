/**
 * Lukke-værn: en sag lukkes ikke stille med ufaktureret arbejde. Serveren
 * afviser lukning med en fejl der starter med UNBILLED_PREFIX; UI'et viser
 * beskeden som bekræftelse og sender igen med acknowledgeUnbilled.
 */

import { HANDOVER_PREFIX, isHandoverCloseError } from './handover-close-guard'

export { isHandoverCloseError }

export const UNBILLED_PREFIX = 'UNBILLED: '

export function isUnbilledCloseError(error: string | null | undefined): error is string {
  return !!error && error.startsWith(UNBILLED_PREFIX)
}

/**
 * Klient (aflevering-værnet, lib/cases/handover-close-guard): tydelig advarsel + eksplicit bekræftelse + obligatorisk
 * begrundelse. null = annulleret (intet lukkes).
 */
export function askHandoverOverrideReason(error: string): string | null {
  if (typeof window === 'undefined') return null
  const msg = error.startsWith(HANDOVER_PREFIX) ? error.slice(HANDOVER_PREFIX.length) : error
  if (!window.confirm(`⚠ ${msg}\n\nSagen bør først lukkes, når afleveringen er udfyldt.\n\nOK = luk ALLIGEVEL (kræver begrundelse, logges)`)) return null
  const reason = window.prompt('Begrundelse for at lukke uden komplet aflevering (logges med de manglende punkter):', '')
  return reason && reason.trim() ? reason.trim() : null
}

export type CloseConfirmations = { acknowledgeUnbilled?: boolean; handoverOverride?: { reason: string } }

/**
 * Klient: kør en lukke-handling og håndtér værnene i den rækkefølge serveren melder dem (aflevering, ufaktureret).
 * Returnerer null hvis brugeren annullerede.
 */
export async function runCloseWithConfirmations<T extends { success: boolean; error?: string | null }>(
  call: (opts: CloseConfirmations) => Promise<T>,
): Promise<T | null> {
  const opts: CloseConfirmations = {}
  let res = await call(opts)
  for (let i = 0; i < 2 && !res.success; i++) {
    if (isHandoverCloseError(res.error) && !opts.handoverOverride) {
      const reason = askHandoverOverrideReason(res.error)
      if (!reason) return null
      opts.handoverOverride = { reason }
    } else if (isUnbilledCloseError(res.error) && !opts.acknowledgeUnbilled) {
      if (!confirmCloseDespiteUnbilled(res.error)) return null
      opts.acknowledgeUnbilled = true
    } else break
    res = await call(opts)
  }
  return res
}

/** Klient: spørg brugeren. true = luk alligevel. */
export function confirmCloseDespiteUnbilled(error: string): boolean {
  if (typeof window === 'undefined') return false
  return window.confirm(`${error.slice(UNBILLED_PREFIX.length)}\n\nFakturér først (Fakturakladde), eller luk sagen alligevel?\n\nOK = luk alligevel`)
}
