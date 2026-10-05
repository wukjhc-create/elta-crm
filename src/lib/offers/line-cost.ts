/**
 * 00192: kostkolonnerne på offer_line_items kan ikke læses af `authenticated`. Linjer hentes derfor med
 * OFFER_LINE_PUBLIC_COLUMNS, og kost flettes ind her — via admin-klienten og KUN når kalderen har
 * kost-permission (typisk offers.view.cost_prices). Uden permission sættes kostfelterne til null
 * (samme form som D43's stripLineCost). Ikke en server action — kaldes kun fra gatede actions.
 * Se docs/runbooks/rls-cost-columns.md.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { OFFER_LINE_COST_COLUMNS, type OfferLineCostColumn } from '@/lib/offers/line-columns'

export type OfferLineCostFields = Record<OfferLineCostColumn, number | null>

const NULL_COST: OfferLineCostFields = {
  cost_price: null,
  supplier_cost_price_at_creation: null,
  supplier_margin_applied: null,
  margin_percentage: null,
}

/** Henter kostkolonnerne for de givne linje-id'er (admin-klient). Kalderen SKAL have tjekket kost-permission. */
export async function fetchOfferLineCostById(lineIds: string[]): Promise<Map<string, OfferLineCostFields>> {
  const out = new Map<string, OfferLineCostFields>()
  const ids = Array.from(new Set(lineIds.filter(Boolean)))
  if (ids.length === 0) return out
  const admin = createAdminClient()
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await admin
      .from('offer_line_items')
      .select(`id, ${OFFER_LINE_COST_COLUMNS.join(', ')}`)
      .in('id', ids.slice(i, i + 300))
    if (error) throw new Error(`Kunne ikke hente linjekost: ${error.message}`)
    for (const row of (data ?? []) as unknown as Array<{ id: string } & Partial<OfferLineCostFields>>) {
      out.set(row.id, {
        cost_price: row.cost_price ?? null,
        supplier_cost_price_at_creation: row.supplier_cost_price_at_creation ?? null,
        supplier_margin_applied: row.supplier_margin_applied ?? null,
        margin_percentage: row.margin_percentage ?? null,
      })
    }
  }
  return out
}

/**
 * Fletter kostfelter ind i linjer hentet med offentlige kolonner. `canSeeCost=false` → kostfelter = null
 * (ingen admin-opslag).
 */
export async function mergeOfferLineCost<T extends { id: string }>(
  lines: T[],
  canSeeCost: boolean,
): Promise<Array<T & OfferLineCostFields>> {
  if (!canSeeCost || lines.length === 0) return lines.map((li) => ({ ...li, ...NULL_COST }))
  const costById = await fetchOfferLineCostById(lines.map((li) => li.id))
  return lines.map((li) => ({ ...li, ...(costById.get(li.id) ?? NULL_COST) }))
}
