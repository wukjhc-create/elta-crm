/**
 * Antal opgaver der allerede er hentet for en dag. 0 skjules, så en tom dag ikke ligner et tal.
 */
export function dayTaskCountText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null
  const n = Math.floor(count)
  return n === 1 ? '1 opgave' : `${n} opgaver`
}
