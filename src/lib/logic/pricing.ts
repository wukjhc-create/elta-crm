/**
 * UNIFIED PRICING ENGINE
 *
 * Single source of truth for all price/margin/DB calculations.
 * Used by Kalkulationer, Tilbud, Projekter, and all UI components.
 *
 * Rules:
 * - Salgspris = Nettopris * (1 + avance / 100) + fixedMarkup
 * - DB% = (Salgspris - Kostpris) / Salgspris * 100
 * - All margins come from calculation_settings (fallback to CALC_DEFAULTS)
 */

import { CALC_DEFAULTS } from '@/lib/constants'
import { getDBBadgeClasses, getDBAmountColor, getDBLevel, getDBTextColor, getDBBarColor, getDBLabel, isDBBelowSendThreshold, type DBThresholds, DEFAULT_DB_THRESHOLDS } from '@/lib/utils/db-colors'

// Re-export DB color utils so consumers only need one import
export { getDBBadgeClasses, getDBAmountColor, getDBLevel, getDBTextColor, getDBBarColor, getDBLabel, isDBBelowSendThreshold, DEFAULT_DB_THRESHOLDS }
export type { DBThresholds }

// =====================================================
// Core pricing calculations
// =====================================================

/** Calculate sale price from cost price and margin percentage */
export function calculateSalePrice(
  costPrice: number,
  marginPercentage: number,
  options?: {
    fixedMarkup?: number
    roundTo?: number
    customerDiscount?: number
  }
): number {
  let effectiveCost = costPrice
  if (options?.customerDiscount && options.customerDiscount > 0) {
    effectiveCost = costPrice * (1 - options.customerDiscount / 100)
  }

  let price = effectiveCost * (1 + marginPercentage / 100)

  if (options?.fixedMarkup) {
    price += options.fixedMarkup
  }

  if (options?.roundTo && options.roundTo > 0) {
    price = Math.ceil(price / options.roundTo) * options.roundTo
  }

  return Math.round(price * 100) / 100
}

/** Calculate line total from quantity, unit price, and optional discount */
export function calculateLineTotal(
  quantity: number,
  unitPrice: number,
  discountPercentage: number = 0
): number {
  return quantity * unitPrice * (1 - discountPercentage / 100)
}

// =====================================================
// DB (Dækningsbidrag) calculations
// =====================================================

/** Calculate DB percentage from cost and sale amounts */
export function calculateDBPercentage(totalCost: number, totalSale: number): number {
  if (totalSale <= 0) return 0
  return Math.round(((totalSale - totalCost) / totalSale) * 100)
}

/** Calculate DB amount */
export function calculateDBAmount(totalCost: number, totalSale: number): number {
  return totalSale - totalCost
}

/** Calculate margin percentage from cost and sale price (per unit) */
export function calculateMarginFromPrices(costPrice: number, salePrice: number): number | null {
  if (!costPrice || costPrice <= 0) return null
  return Math.round((salePrice / costPrice - 1) * 100)
}

// =====================================================
// Line item aggregation
// =====================================================

export interface LineItemForDB {
  quantity: number
  unit_price: number
  total: number
  cost_price: number | null
  supplier_cost_price_at_creation: number | null
  supplier_margin_applied: number | null
}

/** Compute offer-level DB from line items */
export function computeOfferDB(lineItems: LineItemForDB[]): {
  totalCost: number
  totalSale: number
  dbAmount: number
  dbPercentage: number
  hasAnyCost: boolean
} {
  const totalCost = lineItems.reduce((sum, item) => {
    const cost = item.cost_price || item.supplier_cost_price_at_creation || 0
    return sum + cost * item.quantity
  }, 0)
  const totalSale = lineItems.reduce((sum, item) => sum + item.total, 0)
  const hasAnyCost = lineItems.some(item => item.cost_price || item.supplier_cost_price_at_creation)

  return {
    totalCost,
    totalSale,
    dbAmount: calculateDBAmount(totalCost, totalSale),
    dbPercentage: calculateDBPercentage(totalCost, totalSale),
    hasAnyCost,
  }
}

/** Get effective margin for a line item (from stored value or computed) */
export function getLineItemMargin(item: LineItemForDB): number | null {
  if (item.supplier_margin_applied) return item.supplier_margin_applied
  const cost = item.cost_price || item.supplier_cost_price_at_creation
  if (cost && cost > 0) return calculateMarginFromPrices(cost, item.unit_price)
  return null
}

// =====================================================
// Convenience: one-call line calculation
// =====================================================

export interface LineCalculation {
  salePrice: number
  total: number
  dbAmount: number
  dbPercentage: number
  trafficLight: 'green' | 'yellow' | 'red'
}

/** Calculate everything for a single line in one call */
export function calculateLine(
  costPrice: number,
  marginPercentage: number,
  quantity: number,
  thresholds?: DBThresholds,
): LineCalculation {
  const salePrice = calculateSalePrice(costPrice, marginPercentage)
  const total = calculateLineTotal(quantity, salePrice)
  const totalCost = costPrice * quantity
  const dbAmount = calculateDBAmount(totalCost, total)
  const dbPercentage = calculateDBPercentage(totalCost, total)
  const trafficLight = getDBLevel(dbPercentage, thresholds)

  return { salePrice, total, dbAmount, dbPercentage, trafficLight }
}

/** Get traffic light color for a margin percentage */
export function getTrafficLight(
  marginOrDBPercentage: number,
  thresholds?: DBThresholds,
): { level: 'green' | 'yellow' | 'red'; label: string; badgeClasses: string; canSend: boolean } {
  const level = getDBLevel(marginOrDBPercentage, thresholds)
  return {
    level,
    label: getDBLabel(marginOrDBPercentage, thresholds),
    badgeClasses: getDBBadgeClasses(marginOrDBPercentage, thresholds),
    canSend: !isDBBelowSendThreshold(marginOrDBPercentage, thresholds),
  }
}

// =====================================================
// Default margin resolution
// =====================================================

/** Get the default product margin (for AO/LM supplier products) */
export function getDefaultProductMargin(): number {
  return CALC_DEFAULTS.MARGINS.PRODUCTS
}

/** Get the default materials margin */
export function getDefaultMaterialsMargin(): number {
  return CALC_DEFAULTS.MARGINS.MATERIALS
}

/** Resolve effective margin with fallback chain */
export function resolveMargin(
  customMargin?: number | null,
  productMargin?: number | null,
  fallback: 'products' | 'materials' = 'products'
): number {
  if (customMargin != null && customMargin >= 0) return customMargin
  if (productMargin != null && productMargin >= 0) return productMargin
  return fallback === 'products'
    ? CALC_DEFAULTS.MARGINS.PRODUCTS
    : CALC_DEFAULTS.MARGINS.MATERIALS
}
