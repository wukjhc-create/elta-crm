/**
 * OF-5 (review 2026-10-17): tilbud fra kalkulation — linjernes kost (minutter × timesats + materialer) manglede tillæg
 * (indirekte/personlig tid, bygnings-/arbejdstypefaktor, overtid) og materialespild, som kalkulationen viste. Linjerne
 * skaleres til kalkulationens samlede kostpris, så tilbuddets DB = den viste. Ren funktion (muterer linjerne).
 * Returnerer kost, der ikke kunne fordeles (ingen linjer med kost) — lægges på reguleringslinjen.
 */
export function scaleLineCostsToTotal(
  lines: Array<{ cost_price: number | null; quantity: number | null }>,
  targetCost: number | null | undefined,
): number {
  const target = Math.round(Number(targetCost ?? 0) * 100) / 100
  if (!(target > 0)) return 0
  const lineCost = lines.reduce((sum, l) => sum + Number(l.cost_price ?? 0) * Number(l.quantity || 0), 0)
  if (lineCost <= 0) return target
  if (Math.abs(target - lineCost) < 0.01) return 0
  const factor = target / lineCost
  for (const l of lines) if (l.cost_price != null) l.cost_price = Math.round(Number(l.cost_price) * factor * 100) / 100
  return 0
}
