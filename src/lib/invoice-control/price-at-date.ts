/**
 * Kostpris PÅ FAKTURADATOEN (ren logik). Bevidst IKKE 'use server'.
 *
 * Økonomi-review 2026-10-07 (X1 #14): fakturakontrollen sammenlignede med DAGENS kostpris — efter en natlig prissynk
 * viste ældre fakturaer falske over-/underpriser. price_history gemmer hver ændring (gammel → ny pris); prisen på en
 * dato er derfor den GAMLE pris i den første ændring EFTER datoen, eller den nuværende pris hvis intet er ændret siden.
 */
export type PriceChange = { supplier_product_id: string; old_cost_price: number | string | null; created_at: string }

/**
 * @param currentCost nuværende cost_price (null = ukendt)
 * @param changesAfter prisændringer for produktet med created_at EFTER fakturadatoens slutning (vilkårlig rækkefølge)
 */
export function costPriceAtDate(currentCost: number | null, changesAfter: PriceChange[]): number | null {
  if (!changesAfter.length) return currentCost
  const first = [...changesAfter].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
  const old = first.old_cost_price == null ? null : Number(first.old_cost_price)
  // En ændring uden kendt gammel pris (fx første import) → vi kan ikke vide prisen på datoen; brug ikke dagens pris
  return old != null && Number.isFinite(old) && old > 0 ? old : null
}
