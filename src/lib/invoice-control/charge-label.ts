/**
 * Tekstmaerke paa en fakturalinje der ligner fragt eller gebyr.
 * Aendrer ikke kontroltal, tolerance eller overpris.
 */
export type ChargeKind = 'fragt' | 'gebyr'

export function chargeLabel(description: string | null | undefined): ChargeKind | null {
  const text = (description ?? '').trim()
  if (!text) return null
  if (/gebyr(?:er)?(?![a-z0-9æøå])/i.test(text)) return 'gebyr'
  if (/(^|[^a-z0-9æøå])(fragt|transport|porto|levering)(?![a-z0-9æøå])/i.test(text)) return 'fragt'
  return null
}

export function chargeLabelText(kind: ChargeKind | null): string | null {
  if (kind === 'fragt') return 'Fragt'
  if (kind === 'gebyr') return 'Gebyr'
  return null
}
