'use server'

/**
 * Offer pricing server actions (Phase 5).
 *
 * Wraps the pure pricing service in auth-aware server actions so the
 * UI can trigger a recompute after manual overrides.
 */

import { revalidatePath } from 'next/cache'
import {
  defaultMarginForCategory,
  priceLine,
  recomputeOfferTotals as recomputeService,
  recalculateOfferFull as recalculateFullService,
  applyLinePricing as applyLineService,
  type ApplyLinePricingInput,
  type OfferTotals,
} from '@/lib/services/offer-pricing'
import { validateUUID } from '@/lib/validations/common'

export interface RecomputeResult {
  success: boolean
  totals?: {
    total_amount: number
    tax_amount: number
    final_amount: number
  }
  error?: string
}

/**
 * Recompute offer totals from current line items. Use after a manual
 * unit_price / discount / quantity override.
 */
export async function recomputeOfferTotalsAction(offerId: string): Promise<RecomputeResult> {
  try {
    validateUUID(offerId, 'offer ID')
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Ugyldigt ID' }
  }

  const totals = await recomputeService(offerId)
  if (!totals) return { success: false, error: 'Kunne ikke opdatere totaler' }

  revalidatePath(`/dashboard/offers/${offerId}`)
  revalidatePath('/dashboard/offers')
  return { success: true, totals }
}

/**
 * Full recalc: re-sum lines, apply offer-level discount + tax, write totals.
 * Manual edits to discount_percentage / discount_amount / tax_percentage are
 * preserved.
 */
export async function recalculateOfferFullAction(offerId: string): Promise<{
  success: boolean
  totals?: OfferTotals
  error?: string
}> {
  try {
    validateUUID(offerId, 'offer ID')
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Ugyldigt ID' }
  }
  const totals = await recalculateFullService(offerId)
  if (!totals) return { success: false, error: 'Kunne ikke opdatere totaler' }
  revalidatePath(`/dashboard/offers/${offerId}`)
  revalidatePath('/dashboard/offers')
  return { success: true, totals }
}

/**
 * Update a single offer line's pricing (manual override) and cascade
 * to offer totals. Pass `salePrice` for explicit override (margin will
 * be back-derived) OR `marginPercentage` to recompute sale from cost.
 */
export async function applyLinePricingAction(
  input: ApplyLinePricingInput & { offerId?: string }
): Promise<{
  success: boolean
  cost_price?: number
  margin_percentage?: number
  sale_price?: number
  total?: number
  error?: string
}> {
  try {
    validateUUID(input.lineId, 'line ID')
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Ugyldigt ID' }
  }

  const result = await applyLineService(input)
  if (result.success && input.offerId) {
    revalidatePath(`/dashboard/offers/${input.offerId}`)
  }
  return result
}

/**
 * Pure helper exposed as a server action for the UI to compute a
 * suggested sale price before persisting.
 */
export async function suggestSalePrice(input: {
  costPrice: number
  quantity: number
  marginPercentage?: number
  category?: string | null
  discountPercentage?: number
}): Promise<{
  margin_percentage: number
  sale_price: number
  total: number
}> {
  const margin =
    typeof input.marginPercentage === 'number'
      ? input.marginPercentage
      : defaultMarginForCategory(input.category ?? null)
  const priced = priceLine(input.costPrice, input.quantity, margin, input.discountPercentage ?? 0)
  return {
    margin_percentage: priced.marginPercentage,
    sale_price: priced.salePrice,
    total: priced.total,
  }
}
