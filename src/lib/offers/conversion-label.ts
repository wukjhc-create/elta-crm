/**
 * Ren tekst for et tilbuds konvertering. Ingen ny status og ingen afsendelse.
 * Klar til sag er de eksisterende statusser sendt, set og accepteret.
 */
const READY = new Set(['sent', 'viewed', 'accepted'])

export function offerConversionLabel(
  status: string | null | undefined,
  convertedCaseId: string | null | undefined,
  hasCase: boolean,
): string | null {
  if (convertedCaseId && hasCase) return 'Konverteret'
  if (convertedCaseId && !hasCase) return 'Sag mangler'
  if (status && READY.has(status)) return 'Klar til sag'
  return null
}
