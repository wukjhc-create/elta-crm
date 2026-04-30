/**
 * Offer Pricing Engine (Phase 5)
 *
 * Single source of truth for cost → margin → sale → total math.
 *
 * offer_line_items columns (after migration 00077):
 *   cost_price          NUMERIC NOT NULL DEFAULT 0   ← unit cost
 *   margin_percentage   NUMERIC NOT NULL DEFAULT 0   ← margin applied
 *   sale_price          NUMERIC NOT NULL DEFAULT 0   ← cost * (1 + margin/100)
 *   unit_price          NUMERIC NOT NULL             ← kept in sync with sale_price (legacy callers)
 *   supplier_margin_applied  ← legacy mirror of margin_percentage
 *   discount_percentage NUMERIC                       ← optional per-line discount
 *   total               NUMERIC                       ← sale_price * quantity * (1 - discount/100)
 *
 * Manual overrides are honored: any line whose sale_price/unit_price was
 * edited keeps that value. recomputeOfferTotals() never rewrites per-line
 * fields — it only sums totals into offers.{total,tax,final}.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

export type MarginCategory =
  | 'solar'
  | 'inverter'
  | 'mounting'
  | 'cable'
  | 'panel'
  | 'breaker'
  | 'rcd'
  | 'service'
  | 'installation'
  | 'project'
  | 'general'

const DEFAULT_MARGIN_FALLBACK = 30

const MARGIN_BY_CATEGORY: Record<string, number> = {
  // Spec: service +40, installation +35, solar +25
  service: 40,
  installation: 35,
  solar: 25,

  // Solar-package member categories inherit the solar margin
  inverter: 25,
  mounting: 25,
  panel: 35,        // panel here = el-tavle ("panel board"), counts as installation
  breaker: 35,
  rcd: 35,
  cable: 35,        // installation cable; solar cable lines pass category='cable' too —
                    // the auto-fill currently uses 35; rep can override per line.

  project: 35,
  general: 30,
}

export function defaultMarginForCategory(category: string | null | undefined): number {
  if (!category) return DEFAULT_MARGIN_FALLBACK
  const key = category.trim().toLowerCase()
  if (key in MARGIN_BY_CATEGORY) return MARGIN_BY_CATEGORY[key]
  return DEFAULT_MARGIN_FALLBACK
}

// =====================================================
// Smart margin rules (Phase 5.1)
//
// Per-jobType base range + ±5 % context adjustments. Output is clamped
// inside the jobType range so we never go below cost-floor or above the
// max realistic ceiling.
// =====================================================

export interface MarginRange {
  min: number
  base: number
  max: number
}

const JOBTYPE_RANGES: Record<string, MarginRange> = {
  // Spec: solar 20–30, installation 30–40, service 40–60
  solar:        { min: 20, base: 25, max: 30 },
  installation: { min: 30, base: 35, max: 40 },
  service:      { min: 40, base: 50, max: 60 },
  // Sensible mid-points for jobtypes outside the spec
  project:      { min: 20, base: 30, max: 40 },
  general:      { min: 25, base: 30, max: 35 },
}

export interface MarginContext {
  /** Small jobs (e.g. ≤2 lines, single visit) get +5 % to cover fixed overhead. */
  isSmallJob?: boolean
  /** Urgent / akut requests can carry +5 % rush margin. */
  isUrgent?: boolean
  /** Large projects (multi-day, scope-heavy) discount −5 % to be competitive. */
  isLargeProject?: boolean
  /** Repeat customer discount −5 %. */
  isRepeatCustomer?: boolean
}

/**
 * Returns the suggested margin (percentage) for a given jobType and context.
 * Clamped to the jobType's [min, max] range.
 */
export function getSuggestedMargin(
  jobType: string | null | undefined,
  context: MarginContext = {}
): number {
  const key = (jobType || 'general').toString().toLowerCase()
  const range = JOBTYPE_RANGES[key] ?? JOBTYPE_RANGES.general

  let margin = range.base
  if (context.isSmallJob) margin += 5
  if (context.isUrgent) margin += 5
  if (context.isLargeProject) margin -= 5
  if (context.isRepeatCustomer) margin -= 5

  // Clamp into the jobType's allowed range.
  if (margin < range.min) margin = range.min
  if (margin > range.max) margin = range.max
  return margin
}

export interface PricedLine {
  costPrice: number
  marginPercentage: number
  salePrice: number
  total: number
}

export function priceLine(
  costPrice: number,
  quantity: number,
  marginPercentage: number,
  discountPercentage = 0
): PricedLine {
  const cost = Math.max(0, Number(costPrice) || 0)
  const qty = Math.max(0, Number(quantity) || 0)
  const margin = Math.max(0, Number(marginPercentage) || 0)
  const discount = Math.min(100, Math.max(0, Number(discountPercentage) || 0))

  const salePrice = round2(cost * (1 + margin / 100))
  const total = round2(salePrice * qty * (1 - discount / 100))
  return { costPrice: cost, marginPercentage: margin, salePrice, total }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// =====================================================
// Apply pricing to a single line (used by manual override path).
// =====================================================

export interface ApplyLinePricingInput {
  lineId: string
  /** Optional override; otherwise read from the row. */
  costPrice?: number
  /** Optional override; otherwise read from the row. */
  quantity?: number
  /** Optional new margin %; if omitted, recompute sale_price from existing margin. */
  marginPercentage?: number
  /** Optional explicit sale price (manual override). When set, margin is back-derived. */
  salePrice?: number
  /** Optional discount %. */
  discountPercentage?: number
}

export async function applyLinePricing(input: ApplyLinePricingInput): Promise<{
  success: boolean
  cost_price?: number
  margin_percentage?: number
  sale_price?: number
  total?: number
  error?: string
}> {
  const supabase = createAdminClient()
  const { data: row, error: readErr } = await supabase
    .from('offer_line_items')
    .select('id, offer_id, cost_price, margin_percentage, sale_price, unit_price, quantity, discount_percentage')
    .eq('id', input.lineId)
    .maybeSingle()

  if (readErr || !row) return { success: false, error: 'Line not found' }

  const costPrice = input.costPrice ?? Number(row.cost_price ?? 0)
  const quantity = input.quantity ?? Number(row.quantity ?? 1)
  const discountPercentage =
    input.discountPercentage ?? Number(row.discount_percentage ?? 0)

  let margin: number
  let sale: number

  if (typeof input.salePrice === 'number') {
    // Manual sale price → back-derive margin if cost > 0.
    sale = round2(input.salePrice)
    margin = costPrice > 0 ? round2(((sale - costPrice) / costPrice) * 100) : 0
  } else {
    margin = input.marginPercentage ?? Number(row.margin_percentage ?? 0)
    const priced = priceLine(costPrice, quantity, margin, discountPercentage)
    sale = priced.salePrice
  }

  const total = round2(sale * quantity * (1 - discountPercentage / 100))

  const { error: updErr } = await supabase
    .from('offer_line_items')
    .update({
      cost_price: costPrice,
      margin_percentage: margin,
      sale_price: sale,
      unit_price: sale,                   // legacy mirror
      supplier_margin_applied: margin,    // legacy mirror
      total,
    })
    .eq('id', input.lineId)

  if (updErr) {
    logger.error('applyLinePricing update failed', { entityId: input.lineId, error: updErr })
    return { success: false, error: updErr.message }
  }

  // Cascade to offer totals.
  if (row.offer_id) await recomputeOfferTotals(row.offer_id)

  return { success: true, cost_price: costPrice, margin_percentage: margin, sale_price: sale, total }
}

// =====================================================
// recalculateOfferFull — full pipeline: resum lines, apply discount, apply tax.
// Respects manual edits: discount_percentage / discount_amount / tax_percentage
// stored on the offer are NEVER rewritten — only totals are derived.
// =====================================================

export interface OfferTotals {
  total_amount: number
  discount_amount: number
  taxable_amount: number
  tax_amount: number
  final_amount: number
}

export async function recalculateOfferFull(offerId: string): Promise<OfferTotals | null> {
  const supabase = createAdminClient()
  try {
    const { data: offer } = await supabase
      .from('offers')
      .select('discount_percentage, discount_amount, tax_percentage')
      .eq('id', offerId)
      .maybeSingle()
    if (!offer) {
      logger.warn('recalculateOfferFull: offer not found', { metadata: { offerId } })
      return null
    }

    const taxPct = Number(offer.tax_percentage ?? 25)
    const discountPct = Number(offer.discount_percentage ?? 0)
    const flatDiscount = Number(offer.discount_amount ?? 0)

    // Sum lines using sale_price * quantity * (1 - line discount).
    // We compute from sale_price directly so a missing/stale `total` doesn't mask edits.
    const { data: lines } = await supabase
      .from('offer_line_items')
      .select('sale_price, unit_price, quantity, discount_percentage')
      .eq('offer_id', offerId)
      .limit(10000)

    const grossLines = round2(
      (lines || []).reduce((s, l) => {
        const sale = Number(l.sale_price ?? l.unit_price ?? 0)
        const qty = Number(l.quantity ?? 0)
        const disc = Math.max(0, Math.min(100, Number(l.discount_percentage ?? 0)))
        return s + sale * qty * (1 - disc / 100)
      }, 0)
    )

    const afterPct = round2(grossLines * (1 - discountPct / 100))
    const totalDiscount = round2(grossLines - afterPct + flatDiscount)
    const taxable = round2(Math.max(0, afterPct - flatDiscount))
    const tax = round2(taxable * (taxPct / 100))
    const finalAmount = round2(taxable + tax)

    const totals: OfferTotals = {
      total_amount: taxable,
      discount_amount: totalDiscount,
      taxable_amount: taxable,
      tax_amount: tax,
      final_amount: finalAmount,
    }

    const { error } = await supabase
      .from('offers')
      .update({
        total_amount: totals.total_amount,
        tax_amount: totals.tax_amount,
        final_amount: totals.final_amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', offerId)

    if (error) {
      logger.error('recalculateOfferFull update failed', {
        entity: 'offers',
        entityId: offerId,
        error,
      })
      return null
    }

    console.log('OFFER TOTAL UPDATED:', totals.final_amount, '(taxable', totals.taxable_amount, ')')
    return totals
  } catch (err) {
    logger.error('recalculateOfferFull threw', { entityId: offerId, error: err })
    return null
  }
}

// =====================================================
// Discount suggester
// =====================================================

export interface DiscountSuggestion {
  percentage: number
  reason: string
}

export function suggestDiscount(args: {
  totalAmount: number
  isRepeatCustomer?: boolean
}): DiscountSuggestion | null {
  const total = Math.max(0, Number(args.totalAmount) || 0)
  const candidates: DiscountSuggestion[] = []
  if (total > 50_000) candidates.push({ percentage: 5, reason: 'Total > 50.000 kr' })
  if (args.isRepeatCustomer) candidates.push({ percentage: 3, reason: 'Tidligere kunde' })
  if (candidates.length === 0) return null
  // Take the largest applicable suggestion.
  candidates.sort((a, b) => b.percentage - a.percentage)
  return candidates[0]
}

// =====================================================
// Recompute offer totals from its line items.
// =====================================================

/**
 * Sums offer_line_items.total → offers.total_amount; applies tax_percentage
 * to derive tax_amount + final_amount; respects offer-level discount columns
 * if set.
 *
 * Best-effort. Never throws. Returns the new totals (or null on failure).
 */
export async function recomputeOfferTotals(offerId: string): Promise<{
  total_amount: number
  tax_amount: number
  final_amount: number
} | null> {
  const supabase = createAdminClient()

  try {
    // Pull current offer-level discount + tax settings
    const { data: offer } = await supabase
      .from('offers')
      .select('discount_percentage, discount_amount, tax_percentage')
      .eq('id', offerId)
      .maybeSingle()

    if (!offer) {
      logger.warn('recomputeOfferTotals: offer not found', { metadata: { offerId } })
      return null
    }

    const taxPct = Number(offer.tax_percentage ?? 25)
    const offerDiscountPct = Number(offer.discount_percentage ?? 0)
    const offerDiscountAmt = Number(offer.discount_amount ?? 0)

    // Sum all lines
    const { data: lines } = await supabase
      .from('offer_line_items')
      .select('total')
      .eq('offer_id', offerId)
      .limit(10000)

    const sumLines = round2(
      (lines || []).reduce((s, l) => s + Number(l.total ?? 0), 0)
    )

    const afterPctDiscount = round2(sumLines * (1 - offerDiscountPct / 100))
    const afterFlatDiscount = round2(Math.max(0, afterPctDiscount - offerDiscountAmt))
    const taxAmount = round2(afterFlatDiscount * (taxPct / 100))
    const finalAmount = round2(afterFlatDiscount + taxAmount)

    const totals = {
      total_amount: afterFlatDiscount,
      tax_amount: taxAmount,
      final_amount: finalAmount,
    }

    const { error } = await supabase
      .from('offers')
      .update({
        total_amount: totals.total_amount,
        tax_amount: totals.tax_amount,
        final_amount: totals.final_amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', offerId)

    if (error) {
      logger.error('recomputeOfferTotals update failed', {
        entity: 'offers',
        entityId: offerId,
        error,
      })
      return null
    }

    return totals
  } catch (err) {
    logger.error('recomputeOfferTotals threw', { entityId: offerId, error: err })
    return null
  }
}
