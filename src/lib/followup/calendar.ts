/**
 * Dansk forretningskalender for opfoelgning (P3 #16). Rene funktioner.
 *
 * Fund (docs/followup/FOLLOWUP_ENGINE_DESIGN.md): dagens regler regner i blanding af UTC-midnat, lokal 23:59:59,
 * `setDate(getDate()-N)` paa servertid og millisekund-floor. Her er ALT hele kalenderdage i Europe/Copenhagen:
 * en dato-streng 'YYYY-MM-DD' er én dag, og "N dage siden" betyder N kalenderdage — uafhaengigt af klokkeslaet,
 * sommertid og hvornaar cron'en koerer.
 */

const TZ = 'Europe/Copenhagen'
const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ })

/** Lokal dansk kalenderdato ('YYYY-MM-DD') for et tidspunkt (ISO-streng/Date) eller en ren dato-streng. */
export function localDay(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return dayFmt.format(typeof value === 'string' ? new Date(value) : value)
}

/** Hele kalenderdage fra `from` til `to` (begge lokale dage). Negativ hvis `to` ligger foer `from`. */
export function daysBetween(from: string | Date, to: string | Date): number {
  const a = Date.parse(`${localDay(from)}T00:00:00Z`)
  const b = Date.parse(`${localDay(to)}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** Dato-streng + N dage. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Er et tilbud/dokument gyldigt paa `today`? Gyldig TIL OG MED sidste dag (lokal kalender). */
export function validOn(validUntil: string | null | undefined, today: string): boolean {
  return !validUntil || localDay(validUntil) >= today
}
