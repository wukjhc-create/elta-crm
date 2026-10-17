/**
 * TK-1/TK-2 (review 2026-10-17): <input type="datetime-local"> har ingen tidszone. Felter skal forudfyldes med DANSK
 * vægurstid og gemmes som dansk tid → UTC-ISO — uanset browserens/serverens tidszone. Før blev UTC-klokken vist og
 * gemt som lokal (−1/−2 t ved hver gem) eller den rå streng sendt til Postgres (gemt som UTC: +1/+2 t).
 * Ren funktion — bruges i klientkomponenter og server actions.
 */
import { copenhagenLocalToIso, copenhagenParts } from '@/lib/utils/copenhagen-time'

/** ISO-tidsstempel → "YYYY-MM-DDTHH:mm" i dansk tid (til datetime-local) */
export function isoToCopenhagenInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const p = copenhagenParts(new Date(t))
  return `${p.date}T${p.clock.slice(0, 5)}`
}

/** "YYYY-MM-DDTHH:mm" (dansk vægurstid) → UTC-ISO. Tom/ugyldig → null. */
export function copenhagenInputToIso(value: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(value ?? '').trim())
  if (!m) return null
  return copenhagenLocalToIso(m[1], m[2])
}
