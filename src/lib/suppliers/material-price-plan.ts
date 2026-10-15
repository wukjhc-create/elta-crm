/**
 * GP-8 (grossist-review 2026-10-14): hvilke Kalkia-materialer skal have ny kostpris fra den koblede leverandørvare.
 * Ren logik — bevidst IKKE 'use server'.
 *
 *  - kun KOSTPRISEN synkroniseres; salgsprisen er materialets egen (før blev den overskrevet med grossistens
 *    vejledende udsalgspris — eller null når den manglede)
 *  - kost ≤ 0 / ukendt betyder "ingen prisaftale" og må aldrig overskrive en kendt kost
 */
export interface MaterialForSync { id: string; supplier_product_id: string | null; cost_price: number | string | null; auto_update_price?: boolean | null }
export interface SupplierCostForSync { id: string; cost_price: number | string | null }

export function planMaterialCostUpdates(
  materials: MaterialForSync[],
  supplierProducts: Map<string, SupplierCostForSync>,
  opts: { requireAutoUpdate: boolean },
): { updates: Array<{ id: string; cost_price: number }>; skipped: number } {
  const updates: Array<{ id: string; cost_price: number }> = []
  let skipped = 0
  for (const m of materials) {
    if (opts.requireAutoUpdate && !m.auto_update_price) { skipped++; continue }
    const sp = m.supplier_product_id ? supplierProducts.get(m.supplier_product_id) : undefined
    const cost = sp ? Number(sp.cost_price) : NaN
    if (!sp || !Number.isFinite(cost) || cost <= 0) { skipped++; continue }
    if (m.cost_price !== null && m.cost_price !== undefined && Number(m.cost_price) === cost) { skipped++; continue }
    updates.push({ id: m.id, cost_price: cost })
  }
  return { updates, skipped }
}
