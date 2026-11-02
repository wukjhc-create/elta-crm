/**
 * Kundenoter (customer_notes) er en valgfri tabel: den findes kun hvor migrationen er anvendt (staging før prod).
 * Skel mellem "tabellen findes ikke her" (unavailable — skjul notefunktioner uden advarsel) og en egentlig læsefejl
 * (error — vis den, tæl den ikke som tom). Bruges af noteloggen, tidslinjen, mailkortet og opkaldskortet.
 */

export type CustomerNotesAvailability = 'available' | 'unavailable' | 'error'

/** PostgREST: PGRST205 = tabellen er ikke i skema-cachen; Postgres: 42P01 = relationen findes ikke. */
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01'])

export function isMissingTableError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  if (error.code && MISSING_TABLE_CODES.has(error.code)) return true
  const message = error.message ?? ''
  return /customer_notes/.test(message) && /(does not exist|could not find the table|schema cache)/i.test(message)
}

export function customerNotesAvailabilityFromError(error: { code?: string | null; message?: string | null } | null | undefined): CustomerNotesAvailability {
  if (!error) return 'available'
  return isMissingTableError(error) ? 'unavailable' : 'error'
}

export const CUSTOMER_NOTES_UNAVAILABLE_TEXT = 'Kundenoter er ikke slået til her endnu. Intet er gemt.'
export const CUSTOMER_NOTES_ERROR_TEXT = 'Kundenoter kunne ikke kontrolleres lige nu. Intet er gemt.'

/** Tekst til en deaktiveret note-knap; null når noter kan bruges. */
export function customerNotesBlockedReason(state: CustomerNotesAvailability): string | null {
  if (state === 'available') return null
  return state === 'unavailable' ? 'Kundenoter er ikke slået til her endnu.' : 'Kundenoter kunne ikke kontrolleres lige nu.'
}
