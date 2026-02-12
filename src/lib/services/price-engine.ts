/**
 * Professional Price Engine
 *
 * Extends the existing margin-rules and customer-pricing systems with:
 * - Customer tier classification (Standard, Sølv, Guld, Platin)
 * - Volume-based pricing brackets
 * - Multi-supplier price comparison
 * - Price negotiation support
 * - Margin analytics
 *
 * Works with existing database tables:
 * - supplier_margin_rules (margin rules with priority)
 * - customer_supplier_prices (customer-supplier agreements)
 * - customer_product_prices (product-level overrides)
 * - supplier_products (product catalog with prices)
 */

// =====================================================
// Customer Tier System
// =====================================================

/** Customer pricing tier */
export type CustomerTier = 'standard' | 'silver' | 'gold' | 'platinum'

/** Tier configuration with discount levels */
export interface TierConfig {
  tier: CustomerTier
  label: string
  description: string
  /** Base discount percentage applied to all purchases */
  base_discount_percent: number
  /** Additional discount for orders above volume threshold */
  volume_discount_percent: number
  /** Volume threshold in DKK for additional discount */
  volume_threshold_dkk: number
  /** Minimum annual purchase to qualify for this tier */
  min_annual_purchase_dkk: number
  /** Maximum discount this tier can receive */
  max_discount_percent: number
}

/** Default tier configurations */
export const CUSTOMER_TIERS: Record<CustomerTier, TierConfig> = {
  standard: {
    tier: 'standard',
    label: 'Standard',
    description: 'Standardkunde - ingen rabataftale',
    base_discount_percent: 0,
    volume_discount_percent: 0,
    volume_threshold_dkk: 0,
    min_annual_purchase_dkk: 0,
    max_discount_percent: 5,
  },
  silver: {
    tier: 'silver',
    label: 'Sølv',
    description: 'Fast kunde med basisrabat',
    base_discount_percent: 5,
    volume_discount_percent: 2,
    volume_threshold_dkk: 50000,
    min_annual_purchase_dkk: 100000,
    max_discount_percent: 10,
  },
  gold: {
    tier: 'gold',
    label: 'Guld',
    description: 'Vigtig kunde med udvidet rabat',
    base_discount_percent: 10,
    volume_discount_percent: 3,
    volume_threshold_dkk: 100000,
    min_annual_purchase_dkk: 500000,
    max_discount_percent: 18,
  },
  platinum: {
    tier: 'platinum',
    label: 'Platin',
    description: 'Strategisk samarbejdspartner',
    base_discount_percent: 15,
    volume_discount_percent: 5,
    volume_threshold_dkk: 200000,
    min_annual_purchase_dkk: 1000000,
    max_discount_percent: 25,
  },
}

// =====================================================
// Volume Pricing
// =====================================================

/** Volume pricing bracket */
export interface VolumeBracket {
  min_quantity: number
  max_quantity: number | null // null = unlimited
  discount_percent: number
  label: string
}

/** Standard volume brackets for products */
export const DEFAULT_VOLUME_BRACKETS: VolumeBracket[] = [
  { min_quantity: 1, max_quantity: 9, discount_percent: 0, label: 'Enkelt' },
  { min_quantity: 10, max_quantity: 24, discount_percent: 3, label: '10+ stk' },
  { min_quantity: 25, max_quantity: 49, discount_percent: 5, label: '25+ stk' },
  { min_quantity: 50, max_quantity: 99, discount_percent: 8, label: '50+ stk' },
  { min_quantity: 100, max_quantity: null, discount_percent: 12, label: '100+ stk' },
]

/**
 * Get the volume discount for a given quantity
 */
export function getVolumeDiscount(
  quantity: number,
  brackets: VolumeBracket[] = DEFAULT_VOLUME_BRACKETS
): { discount_percent: number; bracket_label: string } {
  for (let i = brackets.length - 1; i >= 0; i--) {
    const bracket = brackets[i]
    if (quantity >= bracket.min_quantity) {
      return {
        discount_percent: bracket.discount_percent,
        bracket_label: bracket.label,
      }
    }
  }
  return { discount_percent: 0, bracket_label: 'Enkelt' }
}

// =====================================================
// Price Calculation
// =====================================================

/** Full price calculation input */
export interface PriceCalculationInput {
  /** Base cost price from supplier */
  cost_price: number
  /** List price (if different from cost) */
  list_price?: number
  /** Quantity being purchased */
  quantity: number
  /** Customer tier */
  customer_tier: CustomerTier
  /** Customer-specific discount override (from customer_supplier_prices) */
  customer_discount_override?: number
  /** Margin percentage to apply */
  margin_percent: number
  /** Fixed markup amount (from margin rules) */
  fixed_markup?: number
  /** Round to nearest value (from margin rules) */
  round_to?: number
  /** Volume brackets to use */
  volume_brackets?: VolumeBracket[]
  /** Order total for volume threshold check */
  order_total_dkk?: number
}

/** Detailed price calculation result */
export interface PriceCalculationResult {
  /** Original cost price per unit */
  unit_cost_price: number
  /** Effective cost after all discounts */
  effective_cost_price: number
  /** Sale price per unit (after margin + markup + rounding) */
  unit_sale_price: number
  /** Total cost for quantity */
  total_cost: number
  /** Total sale price for quantity */
  total_sale: number
  /** Total profit (sale - cost) */
  total_profit: number
  /** Effective margin percentage */
  effective_margin_percent: number
  /** Discounts applied */
  discounts: {
    tier_discount_percent: number
    volume_discount_percent: number
    customer_override_percent: number
    total_discount_percent: number
  }
  /** Breakdown */
  breakdown: {
    step: string
    value: number
  }[]
}

/**
 * Calculate a complete price with all factors.
 * Applies: tier discount → volume discount → customer override → margin → markup → rounding
 */
export function calculatePrice(input: PriceCalculationInput): PriceCalculationResult {
  const tierConfig = CUSTOMER_TIERS[input.customer_tier]
  const breakdown: { step: string; value: number }[] = []

  // Step 1: Start with cost price
  let effectiveCost = input.cost_price
  breakdown.push({ step: 'Indkøbspris', value: effectiveCost })

  // Step 2: Apply tier discount
  let tierDiscount = tierConfig.base_discount_percent
  if (input.order_total_dkk && input.order_total_dkk >= tierConfig.volume_threshold_dkk) {
    tierDiscount += tierConfig.volume_discount_percent
  }
  tierDiscount = Math.min(tierDiscount, tierConfig.max_discount_percent)

  if (tierDiscount > 0) {
    effectiveCost *= (1 - tierDiscount / 100)
    breakdown.push({ step: `Kundetrin rabat (${tierConfig.label}: ${tierDiscount}%)`, value: effectiveCost })
  }

  // Step 3: Apply volume discount
  const { discount_percent: volumeDiscount, bracket_label } = getVolumeDiscount(
    input.quantity,
    input.volume_brackets
  )
  if (volumeDiscount > 0) {
    effectiveCost *= (1 - volumeDiscount / 100)
    breakdown.push({ step: `Mængderabat (${bracket_label}: ${volumeDiscount}%)`, value: effectiveCost })
  }

  // Step 4: Apply customer-specific override
  const customerOverride = input.customer_discount_override ?? 0
  if (customerOverride > 0) {
    effectiveCost *= (1 - customerOverride / 100)
    breakdown.push({ step: `Kundeaftale rabat (${customerOverride}%)`, value: effectiveCost })
  }

  // Total discount (for reporting)
  const totalDiscountPercent = input.cost_price > 0
    ? ((input.cost_price - effectiveCost) / input.cost_price) * 100
    : 0

  // Step 5: Apply margin
  let salePrice = effectiveCost * (1 + input.margin_percent / 100)
  breakdown.push({ step: `Avance (${input.margin_percent}%)`, value: salePrice })

  // Step 6: Apply fixed markup
  if (input.fixed_markup && input.fixed_markup > 0) {
    salePrice += input.fixed_markup
    breakdown.push({ step: `Fast tillæg (${input.fixed_markup} DKK)`, value: salePrice })
  }

  // Step 7: Round to nearest
  if (input.round_to && input.round_to > 0) {
    salePrice = Math.round(salePrice / input.round_to) * input.round_to
    breakdown.push({ step: `Afrunding til ${input.round_to} DKK`, value: salePrice })
  }

  // Calculate totals
  const totalCost = effectiveCost * input.quantity
  const totalSale = salePrice * input.quantity
  const totalProfit = totalSale - totalCost
  const effectiveMargin = totalSale > 0 ? (totalProfit / totalSale) * 100 : 0

  return {
    unit_cost_price: Math.round(input.cost_price * 100) / 100,
    effective_cost_price: Math.round(effectiveCost * 100) / 100,
    unit_sale_price: Math.round(salePrice * 100) / 100,
    total_cost: Math.round(totalCost * 100) / 100,
    total_sale: Math.round(totalSale * 100) / 100,
    total_profit: Math.round(totalProfit * 100) / 100,
    effective_margin_percent: Math.round(effectiveMargin * 10) / 10,
    discounts: {
      tier_discount_percent: tierDiscount,
      volume_discount_percent: volumeDiscount,
      customer_override_percent: customerOverride,
      total_discount_percent: Math.round(totalDiscountPercent * 10) / 10,
    },
    breakdown,
  }
}

// =====================================================
// Multi-Supplier Price Comparison
// =====================================================

/** Supplier product for comparison */
export interface SupplierProductForComparison {
  supplier_id: string
  supplier_name: string
  supplier_product_id: string
  sku: string
  product_name: string
  cost_price: number
  list_price: number | null
  is_available: boolean
  lead_time_days: number | null
  last_synced_at: string | null
}

/** Price comparison result for a single product across suppliers */
export interface PriceComparisonResult {
  product_description: string
  quantity: number
  suppliers: {
    supplier_id: string
    supplier_name: string
    sku: string
    unit_cost: number
    unit_sale: number
    total_cost: number
    total_sale: number
    margin_percent: number
    is_available: boolean
    lead_time_days: number | null
    is_cheapest: boolean
    is_recommended: boolean
    savings_vs_most_expensive: number
  }[]
  cheapest_supplier: string
  most_expensive_supplier: string
  price_spread_percent: number
}

/**
 * Compare prices across multiple suppliers for a product.
 * Considers availability, lead time, and effective pricing.
 */
export function compareSupplierPrices(
  products: SupplierProductForComparison[],
  quantity: number,
  marginPercent: number,
  customerTier: CustomerTier = 'standard'
): PriceComparisonResult {
  if (products.length === 0) {
    return {
      product_description: '',
      quantity,
      suppliers: [],
      cheapest_supplier: '',
      most_expensive_supplier: '',
      price_spread_percent: 0,
    }
  }

  const priced = products.map(p => {
    const calc = calculatePrice({
      cost_price: p.cost_price,
      list_price: p.list_price ?? undefined,
      quantity,
      customer_tier: customerTier,
      margin_percent: marginPercent,
    })

    return {
      supplier_id: p.supplier_id,
      supplier_name: p.supplier_name,
      sku: p.sku,
      unit_cost: calc.effective_cost_price,
      unit_sale: calc.unit_sale_price,
      total_cost: calc.total_cost,
      total_sale: calc.total_sale,
      margin_percent: calc.effective_margin_percent,
      is_available: p.is_available,
      lead_time_days: p.lead_time_days,
      is_cheapest: false,
      is_recommended: false,
      savings_vs_most_expensive: 0,
    }
  })

  // Sort by total cost
  priced.sort((a, b) => a.total_cost - b.total_cost)

  // Mark cheapest (that's available)
  const cheapestAvailable = priced.find(p => p.is_available)
  if (cheapestAvailable) {
    cheapestAvailable.is_cheapest = true
    cheapestAvailable.is_recommended = true
  }

  // Calculate savings vs most expensive
  const maxCost = Math.max(...priced.map(p => p.total_cost))
  for (const p of priced) {
    p.savings_vs_most_expensive = Math.round((maxCost - p.total_cost) * 100) / 100
  }

  const cheapest = priced[0]
  const mostExpensive = priced[priced.length - 1]
  const spread = cheapest.total_cost > 0
    ? ((mostExpensive.total_cost - cheapest.total_cost) / cheapest.total_cost) * 100
    : 0

  return {
    product_description: products[0].product_name,
    quantity,
    suppliers: priced,
    cheapest_supplier: cheapest.supplier_name,
    most_expensive_supplier: mostExpensive.supplier_name,
    price_spread_percent: Math.round(spread * 10) / 10,
  }
}

// =====================================================
// Margin Analytics
// =====================================================

/** Margin analysis for a set of line items */
export interface MarginAnalysis {
  total_cost: number
  total_sale: number
  total_profit: number
  overall_margin_percent: number
  /** Per-item margin details */
  items: {
    description: string
    cost: number
    sale: number
    profit: number
    margin_percent: number
    is_below_minimum: boolean
  }[]
  /** Warnings */
  warnings: string[]
  /** Items below minimum margin threshold */
  below_minimum_count: number
  /** Average margin */
  average_margin_percent: number
  /** Weakest margin item */
  weakest_item: string | null
  /** Strongest margin item */
  strongest_item: string | null
}

/**
 * Analyze margins across a set of line items.
 * Identifies weak spots, warnings, and overall health.
 */
export function analyzeMargins(
  items: { description: string; cost: number; sale: number }[],
  minimumMarginPercent: number = 15
): MarginAnalysis {
  const warnings: string[] = []
  let totalCost = 0
  let totalSale = 0
  let belowMinCount = 0
  let weakestMargin = Infinity
  let strongestMargin = -Infinity
  let weakestItem: string | null = null
  let strongestItem: string | null = null

  const analyzed = items.map(item => {
    const profit = item.sale - item.cost
    const margin = item.sale > 0 ? (profit / item.sale) * 100 : 0
    const isBelowMin = margin < minimumMarginPercent

    totalCost += item.cost
    totalSale += item.sale

    if (isBelowMin) belowMinCount++

    if (margin < weakestMargin) {
      weakestMargin = margin
      weakestItem = item.description
    }
    if (margin > strongestMargin) {
      strongestMargin = margin
      strongestItem = item.description
    }

    return {
      description: item.description,
      cost: Math.round(item.cost * 100) / 100,
      sale: Math.round(item.sale * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      margin_percent: Math.round(margin * 10) / 10,
      is_below_minimum: isBelowMin,
    }
  })

  const totalProfit = totalSale - totalCost
  const overallMargin = totalSale > 0 ? (totalProfit / totalSale) * 100 : 0
  const avgMargin = analyzed.length > 0
    ? analyzed.reduce((s, i) => s + i.margin_percent, 0) / analyzed.length
    : 0

  // Generate warnings
  if (belowMinCount > 0) {
    warnings.push(
      `${belowMinCount} af ${items.length} linjer har margin under ${minimumMarginPercent}%`
    )
  }
  if (overallMargin < minimumMarginPercent) {
    warnings.push(
      `Samlet margin ${overallMargin.toFixed(1)}% er under minimumskravet på ${minimumMarginPercent}%`
    )
  }
  if (weakestMargin < 0) {
    warnings.push(
      `"${weakestItem}" har negativ margin (${weakestMargin.toFixed(1)}%) - tab på denne linje`
    )
  }

  return {
    total_cost: Math.round(totalCost * 100) / 100,
    total_sale: Math.round(totalSale * 100) / 100,
    total_profit: Math.round(totalProfit * 100) / 100,
    overall_margin_percent: Math.round(overallMargin * 10) / 10,
    items: analyzed,
    warnings,
    below_minimum_count: belowMinCount,
    average_margin_percent: Math.round(avgMargin * 10) / 10,
    weakest_item: weakestItem,
    strongest_item: strongestItem,
  }
}

// =====================================================
// Price Suggestion Engine
// =====================================================

/** Price suggestion for an offer/quote */
export interface PriceSuggestion {
  /** Suggested sale price */
  suggested_price: number
  /** Reasoning */
  reason: string
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low'
  /** Based on what data */
  based_on: string
}

/**
 * Suggest optimal pricing based on historical data and market position.
 *
 * @param costPrice - Our cost for this product/service
 * @param targetMargin - Desired margin percentage
 * @param historicalPrices - Past prices we've charged (if any)
 * @param competitorPrices - Known competitor prices (if any)
 */
export function suggestPrice(
  costPrice: number,
  targetMargin: number,
  historicalPrices: number[] = [],
  competitorPrices: number[] = []
): PriceSuggestion[] {
  const suggestions: PriceSuggestion[] = []

  // 1. Target margin price
  const targetPrice = costPrice * (1 + targetMargin / 100)
  suggestions.push({
    suggested_price: Math.round(targetPrice * 100) / 100,
    reason: `Målmargin på ${targetMargin}%`,
    confidence: 'high',
    based_on: 'Beregnet fra kostpris og målmargin',
  })

  // 2. Historical average (if available)
  if (historicalPrices.length >= 3) {
    const avgHistorical = historicalPrices.reduce((s, p) => s + p, 0) / historicalPrices.length
    const historicalMargin = avgHistorical > 0
      ? ((avgHistorical - costPrice) / avgHistorical) * 100
      : 0

    suggestions.push({
      suggested_price: Math.round(avgHistorical * 100) / 100,
      reason: `Historisk gennemsnitspris (margin: ${historicalMargin.toFixed(1)}%)`,
      confidence: historicalPrices.length >= 10 ? 'high' : 'medium',
      based_on: `Baseret på ${historicalPrices.length} tidligere tilbud`,
    })
  }

  // 3. Market competitive price (if competitor data available)
  if (competitorPrices.length > 0) {
    const avgCompetitor = competitorPrices.reduce((s, p) => s + p, 0) / competitorPrices.length
    const competitivePrice = avgCompetitor * 0.95 // 5% below competition
    const competitiveMargin = competitivePrice > 0
      ? ((competitivePrice - costPrice) / competitivePrice) * 100
      : 0

    if (competitiveMargin > 10) { // Only suggest if margin is above 10%
      suggestions.push({
        suggested_price: Math.round(competitivePrice * 100) / 100,
        reason: `5% under konkurrentens gennemsnitspris (margin: ${competitiveMargin.toFixed(1)}%)`,
        confidence: 'medium',
        based_on: `Baseret på ${competitorPrices.length} konkurrentpriser`,
      })
    }
  }

  return suggestions
}
