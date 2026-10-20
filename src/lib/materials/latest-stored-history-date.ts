/**
 * Lagret prishistorik-dato i dansk kalender. Ingen pris.
 */
export function storedHistoryDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return new Date(iso).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen' })
}

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
  return storedHistoryDate(bestIso)
}
