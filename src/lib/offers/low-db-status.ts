/**
 * N8a: server-side opslag af et tilbuds DB-status mod Trafiklys' røde grænse (calculation settings).
 * Bruges af sendOfferEmail og updateOfferStatus. Ikke en server action — kaldes kun fra gatede actions.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateOfferLowDb, type OfferLowDbStatus } from '@/lib/offers/low-db-warning'
import type { LineItemForDB } from '@/lib/logic/pricing'

export async function getOfferLowDbStatus(supabase: SupabaseClient, offerId: string): Promise<OfferLowDbStatus | null> {
  const { data } = await supabase
    .from('offers')
    .select('discount_percentage, line_items:offer_line_items(quantity, unit_price, total, cost_price, supplier_cost_price_at_creation, supplier_margin_applied)')
    .eq('id', offerId)
    .maybeSingle()
  const row = data as { discount_percentage?: number | null; line_items?: LineItemForDB[] | null } | null
  if (!row?.line_items?.length) return null
  const { getCalculationSettings } = await import('@/lib/actions/calculation-settings')
  const calc = await getCalculationSettings()
  const red = calc.success && calc.data ? calc.data.margins.db_red_threshold : 10
  return evaluateOfferLowDb(row.line_items, Number(row.discount_percentage ?? 0), red)
}
