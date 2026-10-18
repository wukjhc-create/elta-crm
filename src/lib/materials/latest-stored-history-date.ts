/**
 * Datoen på den senest lagrede prishistorik-række. Ingen pris, og ingen dato når listen er tom.
 */
export function latestStoredHistoryDate(
  rows: readonly { effective_from?: string | null }[],
): string | null {
  let best = Number.NEGATIVE_INFINITY
  let bestIso: string | null = null
  for (const row of rows) {
    const iso = row.effective_from
    if (!iso) continue
    const t = Date.parse(iso)
    if (Number.isNaN(t) || t < best) continue
    best = t
    bestIso = iso
  }
  if (!bestIso) return null
  return new Date(bestIso).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen' })
}
