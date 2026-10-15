/**
 * GP-12 (grossist-review 2026-10-14): manuelle kost-/listeprisændringer på leverandørvarer skal i price_history
 * (change_source 'manual') — før blev kun import/sync registreret, så "berørte tilbud"/pristrends overså dem.
 * Ét sted for begge redigeringsstier (Indstillinger → Leverandører og Produkter → Leverandørvarer).
 * Bevidst IKKE 'use server' — kaldes kun fra gatede server actions; skriver med admin-klienten (00192/00201).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

export type PriceSnapshot = { cost_price: number | null; list_price: number | null }

export async function readSupplierProductPrices(admin: SupabaseClient, supplierProductId: string): Promise<PriceSnapshot | null> {
  const { data } = await admin.from('supplier_products').select('cost_price, list_price').eq('id', supplierProductId).maybeSingle()
  return (data as PriceSnapshot | null) ?? null
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v))

/** Skriver en 'manual'-række når kost- eller listeprisen reelt er ændret. Fejl logges (ændringen selv er gemt). */
export async function recordManualSupplierPriceChange(
  admin: SupabaseClient,
  supplierProductId: string,
  before: PriceSnapshot | null,
  after: { cost_price?: number | null; list_price?: number | null },
): Promise<void> {
  if (!before) return
  const oldCost = num(before.cost_price)
  const oldList = num(before.list_price)
  const newCost = after.cost_price === undefined ? oldCost : num(after.cost_price)
  const newList = after.list_price === undefined ? oldList : num(after.list_price)
  if (oldCost === newCost && oldList === newList) return
  // En ryddet kost (null = ingen prisaftale) er ikke et prisskift — trends/"berørte tilbud" regner på tal
  if (newCost === null) return
  const { error } = await admin.from('price_history').insert({
    supplier_product_id: supplierProductId,
    old_cost_price: oldCost,
    new_cost_price: newCost,
    old_list_price: oldList,
    new_list_price: newList,
    change_percentage: oldCost && oldCost > 0 ? Math.round(((newCost - oldCost) / oldCost) * 10000) / 100 : 0,
    change_source: 'manual',
  })
  if (error) logger.warn('price_history (manuel) kunne ikke skrives', { entityId: supplierProductId, error })
}
