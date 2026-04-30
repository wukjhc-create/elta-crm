/**
 * Offer Starter Packs (Phase 4)
 *
 * Generates starter `offer_line_items` for a fresh draft based on the
 * detected job type. Now backed by the `materials` catalog (Phase 4):
 *
 *   1. Map jobType → list of categories (categoriesForJobType)
 *   2. Pull active materials in those categories
 *   3. Resolve each material → concrete supplier product
 *      a. via material.supplier_product_id binding (fast path)
 *      b. fallback via search_terms / material.name against supplier_products
 *   4. Insert offer_line_items rows with proper section + default unit + default quantity
 *
 * If no material match exists for a jobType, falls back to raw search-term
 * scaffolding (legacy behavior) so the system is never empty.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { getBestSupplierPrice } from '@/lib/services/supplier-best-price'
import {
  categoriesForJobType,
  findMaterialsByCategories,
  resolveMaterialSupplier,
  type StarterJobType,
} from '@/lib/services/material-catalog'
import {
  defaultMarginForCategory,
  getSuggestedMargin,
  priceLine,
  recomputeOfferTotals,
  type MarginContext,
} from '@/lib/services/offer-pricing'
import { createAdminClient as adminForRepeatCheck } from '@/lib/supabase/admin'

export type { StarterJobType } from '@/lib/services/material-catalog'

// Last-resort raw terms (kept for resilience if the materials table is empty)
const RAW_FALLBACK_TERMS: Record<StarterJobType, string[]> = {
  solar:        ['solpanel', 'inverter', 'monteringssystem', 'kabel solar'],
  service:      ['servicebesøg', 'fejlsøgning'],
  installation: ['eltavle', 'gruppeafbryder', 'fejlstrømsafbryder', 'kabel 3x2,5'],
  project:      ['eltavle', 'gruppeafbryder', 'kabel 3x2,5'],
  general:      [],
}

export interface StarterFillResult {
  added: number
  skipped: number
  source: 'materials' | 'fallback' | 'none'
}

/**
 * Insert starter line items for an offer based on detected job type.
 * Best-effort. Never throws.
 */
export interface StarterFillContext {
  /** Detected case priority (medium|high|urgent) — drives isUrgent. */
  priority?: 'low' | 'medium' | 'high' | 'urgent' | null
  /** AI-derived scope text — long/complex scope hints at largeProject. */
  scopeText?: string | null
}

export async function fillOfferStarterLines(args: {
  offerId: string
  customerId: string | null
  jobType: StarterJobType | string | null | undefined
  context?: StarterFillContext
}): Promise<StarterFillResult> {
  const result: StarterFillResult = { added: 0, skipped: 0, source: 'none' }
  const supabase = createAdminClient()

  // Build margin context once per draft.
  const marginContext = await buildMarginContext(args)

  // Determine starting position to coexist with manual edits.
  const { data: lastLine } = await supabase
    .from('offer_line_items')
    .select('position')
    .eq('offer_id', args.offerId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  let position = lastLine?.position ? lastLine.position + 1 : 1

  // ---------- 1. Try materials ----------
  const categories = categoriesForJobType(args.jobType)
  if (categories.length > 0) {
    const materials = await findMaterialsByCategories(categories)
    if (materials.length > 0) {
      result.source = 'materials'
      for (const material of materials) {
        try {
          const resolved = await resolveMaterialSupplier(material, { customerId: args.customerId })
          if (!resolved.supplier) {
            console.log('STARTER LINE NO MATCH (material):', material.slug || material.name)
            result.skipped++
            continue
          }

          const supplier = resolved.supplier
          const quantity = material.default_quantity
          const unit = material.default_unit || supplier.unit || 'stk'

          // Phase 5.1 — smart margin: jobType range + ±5% context adjustments,
          // falling back to per-category default if no jobType is known.
          const marginPct = pickMargin(material.category, args.jobType, marginContext)
          console.log('MARGIN APPLIED:', marginPct, args.jobType ?? '(no jobType)', material.slug || material.name)
          const priced = priceLine(supplier.cost_price, Number(quantity), marginPct, 0)

          const { error } = await supabase.from('offer_line_items').insert({
            offer_id: args.offerId,
            position,
            section: material.section,
            line_type: 'product',
            description: material.name,
            quantity,
            unit,
            // Pricing — explicit columns + legacy mirrors
            cost_price: priced.costPrice,
            margin_percentage: priced.marginPercentage,
            sale_price: priced.salePrice,
            unit_price: priced.salePrice,                 // legacy mirror
            supplier_margin_applied: priced.marginPercentage, // legacy mirror
            discount_percentage: 0,
            total: priced.total,
            // Linkage
            material_id: material.id,
            supplier_product_id: supplier.supplier_product_id,
            supplier_cost_price_at_creation: priced.costPrice,
            supplier_name_at_creation: supplier.supplier_name_at_creation,
            notes: resolved.fromBinding
              ? `Material: ${material.slug ?? material.name} (bundet leverandør)`
              : `Material: ${material.slug ?? material.name} (auto-match)`,
          })

          if (error) {
            console.warn('STARTER LINE INSERT FAILED:', material.slug, error.message)
            result.skipped++
            continue
          }

          console.log(
            'STARTER LINE ADDED:',
            material.slug || material.name,
            '→',
            supplier.supplier_sku,
            `${quantity} ${unit}`,
            `@ ${supplier.cost_price}`
          )
          result.added++
          position++
        } catch (err) {
          logger.warn('Material starter line failed', {
            metadata: { materialId: material.id, offerId: args.offerId },
            error: err,
          })
          result.skipped++
        }
      }
      if (result.added > 0) await recomputeOfferTotals(args.offerId)
      return result
    }
  }

  // ---------- 2. Fallback to raw search terms ----------
  const fallbackKey: StarterJobType = (args.jobType as StarterJobType) in RAW_FALLBACK_TERMS
    ? (args.jobType as StarterJobType)
    : 'general'
  const terms = RAW_FALLBACK_TERMS[fallbackKey]
  if (terms.length === 0) {
    console.log('STARTER LINES: no materials, no fallback for jobType', args.jobType)
    return result
  }

  result.source = 'fallback'
  for (const term of terms) {
    try {
      const match = await getBestSupplierPrice(term, { customerId: args.customerId })
      if (!match) {
        console.log('STARTER LINE NO MATCH (fallback):', term)
        result.skipped++
        continue
      }
      const fallbackMargin = pickMargin(null, args.jobType, marginContext)
      console.log('MARGIN APPLIED:', fallbackMargin, args.jobType ?? '(no jobType)', `(fallback "${term}")`)
      const fallbackPriced = priceLine(match.cost_price, 1, fallbackMargin, 0)
      const { error } = await supabase.from('offer_line_items').insert({
        offer_id: args.offerId,
        position,
        section: 'Materialer',
        line_type: 'product',
        description: match.product_name || term,
        quantity: 1,
        unit: match.unit || 'stk',
        // Pricing — explicit columns + legacy mirrors
        cost_price: fallbackPriced.costPrice,
        margin_percentage: fallbackPriced.marginPercentage,
        sale_price: fallbackPriced.salePrice,
        unit_price: fallbackPriced.salePrice,
        supplier_margin_applied: fallbackPriced.marginPercentage,
        discount_percentage: 0,
        total: fallbackPriced.total,
        supplier_product_id: match.supplier_product_id,
        supplier_cost_price_at_creation: fallbackPriced.costPrice,
        supplier_name_at_creation: match.supplier_name_at_creation,
        notes: `Fallback (search: "${term}")`,
      })
      if (error) {
        console.warn('STARTER LINE INSERT FAILED:', term, error.message)
        result.skipped++
        continue
      }
      console.log('STARTER LINE ADDED (fallback):', term, '→', match.supplier_sku, match.cost_price)
      result.added++
      position++
    } catch (err) {
      logger.warn('Fallback starter line failed', {
        metadata: { term, offerId: args.offerId },
        error: err,
      })
      result.skipped++
    }
  }

  if (result.added > 0) await recomputeOfferTotals(args.offerId)
  return result
}

/**
 * Read-only: returns the materials list for a job type (for UI / debugging).
 */
export async function previewStarterMaterials(jobType: string | null | undefined) {
  const cats = categoriesForJobType(jobType)
  return await findMaterialsByCategories(cats)
}

/**
 * Margin pick rule (Phase 5 + 5.1):
 *  - For known jobTypes (service / installation / solar / project / general)
 *    use the smart range engine `getSuggestedMargin` with context adjustments.
 *  - Otherwise fall back to the per-category default (panel/breaker/cable etc.).
 */
function pickMargin(
  category: string | null | undefined,
  jobType: StarterJobType | string | null | undefined,
  context: MarginContext
): number {
  const jt = (jobType || '').toString().toLowerCase()
  const known = ['service', 'installation', 'solar', 'project', 'general']
  if (known.includes(jt)) {
    return getSuggestedMargin(jt, context)
  }
  return defaultMarginForCategory(category ?? null)
}

// =====================================================
// Build margin context for an offer draft.
//
// - isUrgent          ← case priority high/urgent
// - isLargeProject    ← jobType=project OR scope text >300 chars / mentions
//                       "renovering"/"erhverv"/"nybyg"/"kommerciel"
// - isSmallJob        ← jobType=service AND scope short
// - isRepeatCustomer  ← customer has any non-draft offer
// =====================================================

async function buildMarginContext(args: {
  jobType: StarterJobType | string | null | undefined
  customerId: string | null
  context?: StarterFillContext
}): Promise<MarginContext> {
  const jt = (args.jobType || '').toString().toLowerCase()
  const ctx = args.context || {}
  const scope = (ctx.scopeText || '').toLowerCase()

  const out: MarginContext = {
    isUrgent: ctx.priority === 'urgent' || ctx.priority === 'high',
    isLargeProject:
      jt === 'project' ||
      scope.length > 300 ||
      /(renovering|erhverv|nybyg|kommerciel|entreprise)/.test(scope),
    isSmallJob:
      jt === 'service' && scope.length > 0 && scope.length < 120,
    isRepeatCustomer: false,
  }

  if (args.customerId) {
    try {
      const supabase = adminForRepeatCheck()
      const { count } = await supabase
        .from('offers')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', args.customerId)
        .neq('status', 'draft')
      out.isRepeatCustomer = (count ?? 0) > 0
    } catch (err) {
      logger.warn('repeat-customer check failed', {
        metadata: { customerId: args.customerId },
        error: err,
      })
    }
  }

  return out
}
