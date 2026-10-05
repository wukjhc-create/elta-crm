/**
 * N8a: server-side opslag af et tilbuds DB-status mod Trafiklys' røde grænse (calculation settings).
 * Bruges af sendOfferEmail og updateOfferStatus. Ikke en server action — kaldes kun fra gatede actions.
 *
 * 00192: linjernes kostkolonner er ikke læsbare for `authenticated` — de hentes med admin-klienten (server-side,
 * kaldes kun fra gatede actions). Vurderingen laves for ALLE roller (forretningsreglen: et tilbud med lav DB skal
 * bekræftes før afsendelse — også af salg); kalderen viser kun tal til roller med offers.view.cost_prices
 * (lowDbAckMessage(s, showNumbers)).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateOfferLowDb, type OfferLowDbStatus } from '@/lib/offers/low-db-warning'
import type { LineItemForDB } from '@/lib/logic/pricing'

export async function getOfferLowDbStatus(offerId: string): Promise<OfferLowDbStatus | null> {
  // 00192: kostkolonner — admin-klient (resultatet vises kun som tal for kost-roller)
  const { data } = await createAdminClient()
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
