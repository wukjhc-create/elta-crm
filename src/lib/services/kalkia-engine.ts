// =====================================================
// Kalkia Calculation Engine
// Professional calculation service with full pricing model
// =====================================================

import type {
  KalkiaNode,
  KalkiaVariant,
  KalkiaVariantMaterial,
  KalkiaBuildingProfile,
  KalkiaGlobalFactor,
  KalkiaRule,
  CalculationContext,
  CalculationConditions,
  CalculatedItem,
  CalculationResult,
  KalkiaCalculationItemInput,
} from '@/types/kalkia.types'

// =====================================================
// Default Values
// =====================================================

const DEFAULT_HOURLY_RATE = 495
const DEFAULT_INDIRECT_TIME_FACTOR = 0.15 // 15%
const DEFAULT_PERSONAL_TIME_FACTOR = 0.08 // 8%
const DEFAULT_OVERHEAD_FACTOR = 0.12 // 12%
const DEFAULT_MATERIAL_WASTE_FACTOR = 0.05 // 5%
const DEFAULT_VAT_RATE = 0.25 // 25%

// =====================================================
// Helper Functions
// =====================================================

/**
 * Get factor value by key from global factors
 */
function getFactorValue(
  factors: KalkiaGlobalFactor[],
  key: string,
  defaultValue: number
): number {
  const factor = factors.find((f) => f.factor_key === key && f.is_active)
  if (!factor) return defaultValue

  // Convert percentage to decimal if needed
  if (factor.value_type === 'percentage') {
    return factor.value / 100
  }
  return factor.value
}

/**
 * Check if a rule condition is met
 */
function isConditionMet(
  rule: KalkiaRule,
  conditions: CalculationConditions
): boolean {
  const ruleCondition = rule.condition as Record<string, unknown>

  switch (rule.rule_type) {
    case 'height':
      if (conditions.height !== undefined) {
        const minHeight = ruleCondition.min_height as number | undefined
        const maxHeight = ruleCondition.max_height as number | undefined
        if (minHeight !== undefined && conditions.height < minHeight) return false
        if (maxHeight !== undefined && conditions.height > maxHeight) return false
        return true
      }
      return false

    case 'quantity':
      if (conditions.quantity !== undefined) {
        const minQty = ruleCondition.min_quantity as number | undefined
        const maxQty = ruleCondition.max_quantity as number | undefined
        if (minQty !== undefined && conditions.quantity < minQty) return false
        if (maxQty !== undefined && conditions.quantity > maxQty) return false
        return true
      }
      return false

    case 'access':
      if (conditions.access !== undefined) {
        const accessType = ruleCondition.type as string | undefined
        return accessType === conditions.access
      }
      return false

    case 'distance':
      if (conditions.distance !== undefined) {
        const minDist = ruleCondition.min_distance as number | undefined
        const maxDist = ruleCondition.max_distance as number | undefined
        if (minDist !== undefined && conditions.distance < minDist) return false
        if (maxDist !== undefined && conditions.distance > maxDist) return false
        return true
      }
      return false

    case 'custom':
      // Check all custom conditions
      if (conditions.custom) {
        for (const [key, value] of Object.entries(ruleCondition)) {
          if (conditions.custom[key] !== value) return false
        }
        return true
      }
      return false

    default:
      return false
  }
}

// =====================================================
// Kalkia Calculation Engine Class
// =====================================================

export class KalkiaCalculationEngine {
  private context: CalculationContext
  private indirectTimeFactor: number
  private personalTimeFactor: number
  private overheadFactor: number
  private materialWasteFactor: number
  private profileMultipliers: { time: number; difficulty: number; waste: number; overhead: number }

  constructor(context: CalculationContext) {
    this.context = context

    // Extract factors (once at construction)
    this.indirectTimeFactor = getFactorValue(
      context.globalFactors,
      'indirect_time',
      DEFAULT_INDIRECT_TIME_FACTOR
    )
    this.personalTimeFactor = getFactorValue(
      context.globalFactors,
      'personal_time',
      DEFAULT_PERSONAL_TIME_FACTOR
    )
    this.overheadFactor = getFactorValue(
      context.globalFactors,
      'overhead',
      DEFAULT_OVERHEAD_FACTOR
    )
    this.materialWasteFactor = getFactorValue(
      context.globalFactors,
      'material_waste',
      DEFAULT_MATERIAL_WASTE_FACTOR
    )

    // Cache profile multipliers (constant per engine instance)
    const profile = context.buildingProfile
    this.profileMultipliers = {
      time: profile?.time_multiplier ?? 1,
      difficulty: profile?.difficulty_multiplier ?? 1,
      waste: profile?.material_waste_multiplier ?? 1,
      overhead: profile?.overhead_multiplier ?? 1,
    }
  }

  /**
   * Get the effective hourly rate
   */
  get hourlyRate(): number {
    return this.context.hourlyRate || DEFAULT_HOURLY_RATE
  }

  /**
   * Get building profile multipliers (cached)
   */
  getBuildingProfileMultipliers(): {
    time: number
    difficulty: number
    waste: number
    overhead: number
  } {
    return this.profileMultipliers
  }

  /**
   * Calculate time for a single node with variant and rules
   */
  calculateNodeTime(
    node: KalkiaNode,
    variant: KalkiaVariant | null,
    quantity: number,
    conditions: CalculationConditions,
    rules: KalkiaRule[]
  ): { baseTimeSeconds: number; adjustedTimeSeconds: number; rulesApplied: string[] } {
    // Base time from node
    let baseTimeSeconds = node.base_time_seconds

    // Apply variant adjustments
    if (variant) {
      baseTimeSeconds = Math.round(
        (baseTimeSeconds * variant.time_multiplier) +
        variant.extra_time_seconds +
        variant.base_time_seconds
      )
    }

    // Start with base adjusted time
    let adjustedTimeSeconds = baseTimeSeconds
    const rulesApplied: string[] = []

    // Apply rules
    const applicableRules = rules
      .filter((r) => r.is_active && (r.node_id === node.id || r.variant_id === variant?.id))
      .sort((a, b) => a.priority - b.priority)

    for (const rule of applicableRules) {
      if (isConditionMet(rule, conditions)) {
        adjustedTimeSeconds = Math.round(
          (adjustedTimeSeconds * rule.time_multiplier) + rule.extra_time_seconds
        )
        rulesApplied.push(rule.rule_name)
      }
    }

    // Apply building profile time multiplier
    const profileMultipliers = this.getBuildingProfileMultipliers()
    adjustedTimeSeconds = Math.round(adjustedTimeSeconds * profileMultipliers.time)

    // Multiply by quantity
    baseTimeSeconds = baseTimeSeconds * quantity
    adjustedTimeSeconds = adjustedTimeSeconds * quantity

    return { baseTimeSeconds, adjustedTimeSeconds, rulesApplied }
  }

  /**
   * Calculate material cost for a variant.
   * When supplier prices are available in context, uses live prices
   * from linked supplier products (with customer-specific discounts if applicable).
   */
  calculateMaterialCost(
    materials: KalkiaVariantMaterial[],
    quantity: number,
    wastePercentage: number = 0
  ): { materialCost: number; materialWaste: number; supplierPricesUsed: number } {
    let totalCost = 0
    let supplierPricesUsed = 0

    for (const material of materials) {
      const materialQty = material.quantity * quantity

      // Check for live supplier price override
      const supplierPrice = this.context.supplierPrices?.get(material.id)
      let price: number

      if (supplierPrice && !supplierPrice.isStale) {
        // Use effective cost price from supplier (includes customer discounts)
        price = supplierPrice.effectiveCostPrice
        supplierPricesUsed++
      } else {
        // Fallback to material's stored price
        price = material.cost_price ?? material.sale_price ?? 0
      }

      totalCost += materialQty * price
    }

    // Apply variant waste percentage
    let effectiveWaste = wastePercentage / 100

    // Apply global waste factor
    effectiveWaste += this.materialWasteFactor

    // Apply building profile waste multiplier
    const profileMultipliers = this.getBuildingProfileMultipliers()
    effectiveWaste *= profileMultipliers.waste

    const materialWaste = totalCost * effectiveWaste

    return {
      materialCost: totalCost,
      materialWaste: materialWaste,
      supplierPricesUsed,
    }
  }

  /**
   * Calculate labor cost from time
   */
  calculateLaborCost(timeSeconds: number): number {
    const hours = timeSeconds / 3600
    return hours * this.hourlyRate
  }

  /**
   * Calculate a single item
   */
  calculateItem(
    node: KalkiaNode,
    variant: KalkiaVariant | null,
    materials: KalkiaVariantMaterial[],
    rules: KalkiaRule[],
    input: KalkiaCalculationItemInput
  ): CalculatedItem {
    const { quantity, conditions = {} } = input

    // Calculate time
    const timeResult = this.calculateNodeTime(
      node,
      variant,
      quantity,
      conditions,
      rules
    )

    // Calculate material cost
    const materialResult = this.calculateMaterialCost(
      materials,
      quantity,
      variant?.waste_percentage ?? 0
    )

    // Calculate labor cost
    const laborCost = this.calculateLaborCost(timeResult.adjustedTimeSeconds)

    // Total cost
    const totalCost = materialResult.materialCost + materialResult.materialWaste + laborCost

    // Calculate sale price
    let salePrice = node.default_sale_price * quantity
    if (variant) {
      salePrice *= variant.price_multiplier
    }
    // If no default sale price, estimate from cost
    if (salePrice === 0) {
      salePrice = totalCost * 1.3 // 30% markup as fallback
    }

    return {
      nodeId: node.id,
      variantId: variant?.id ?? null,
      quantity,
      description: variant ? `${node.name} - ${variant.name}` : node.name,
      unit: 'stk',
      baseTimeSeconds: timeResult.baseTimeSeconds,
      adjustedTimeSeconds: timeResult.adjustedTimeSeconds,
      rulesApplied: timeResult.rulesApplied,
      materialCost: materialResult.materialCost,
      materialWaste: materialResult.materialWaste,
      laborCost,
      totalCost,
      salePrice,
      totalSale: salePrice,
      conditions,
    }
  }

  /**
   * Calculate full pricing from item totals
   */
  calculateFinalPricing(
    items: CalculatedItem[],
    marginPercentage: number = 0,
    discountPercentage: number = 0,
    vatPercentage: number = 25,
    riskPercentage: number = 0
  ): CalculationResult {
    // Sum up totals from items
    const totalDirectTimeSeconds = items.reduce((sum, item) => sum + item.adjustedTimeSeconds, 0)
    const totalMaterialCost = items.reduce((sum, item) => sum + item.materialCost, 0)
    const totalMaterialWaste = items.reduce((sum, item) => sum + item.materialWaste, 0)

    // Calculate indirect and personal time
    const totalIndirectTimeSeconds = Math.round(totalDirectTimeSeconds * this.indirectTimeFactor)
    const totalPersonalTimeSeconds = Math.round(totalDirectTimeSeconds * this.personalTimeFactor)
    const totalLaborTimeSeconds = totalDirectTimeSeconds + totalIndirectTimeSeconds + totalPersonalTimeSeconds
    const totalLaborHours = totalLaborTimeSeconds / 3600

    // Calculate labor cost
    const totalLaborCost = totalLaborHours * this.hourlyRate

    // Cost price
    const totalOtherCosts = 0 // Can be extended for transport, equipment, etc.
    const costPrice = totalMaterialCost + totalMaterialWaste + totalLaborCost + totalOtherCosts

    // Apply building profile overhead multiplier
    const profileMultipliers = this.getBuildingProfileMultipliers()
    const effectiveOverheadFactor = this.overheadFactor * profileMultipliers.overhead

    // Overhead and risk
    const overheadAmount = costPrice * effectiveOverheadFactor
    const riskAmount = costPrice * (riskPercentage / 100)

    // Sales basis
    const salesBasis = costPrice + overheadAmount + riskAmount

    // Margin
    const marginAmount = salesBasis * (marginPercentage / 100)
    const salePriceExclVat = salesBasis + marginAmount

    // Discount
    const discountAmount = salePriceExclVat * (discountPercentage / 100)
    const netPrice = salePriceExclVat - discountAmount

    // VAT
    const vatAmount = netPrice * (vatPercentage / 100)
    const finalAmount = netPrice + vatAmount

    // Key metrics
    // DB (Daekningsbidrag) = Net price - Cost price
    const dbAmount = netPrice - costPrice
    const dbPercentage = netPrice > 0 ? (dbAmount / netPrice) * 100 : 0
    const dbPerHour = totalLaborHours > 0 ? dbAmount / totalLaborHours : 0

    // Coverage ratio (Daekningsgrad) - same as DB% for our purposes
    const coverageRatio = dbPercentage

    return {
      // Time totals
      totalDirectTimeSeconds,
      totalIndirectTimeSeconds,
      totalPersonalTimeSeconds,
      totalLaborTimeSeconds,
      totalLaborHours,

      // Cost totals
      totalMaterialCost,
      totalMaterialWaste,
      totalLaborCost,
      totalOtherCosts,
      costPrice,

      // Pricing breakdown
      overheadAmount,
      riskAmount,
      salesBasis,
      marginAmount,
      salePriceExclVat,
      discountAmount,
      netPrice,
      vatAmount,
      finalAmount,

      // Key metrics
      dbAmount,
      dbPercentage,
      dbPerHour,
      coverageRatio,

      // Factors used
      factorsUsed: {
        indirectTimeFactor: this.indirectTimeFactor,
        personalTimeFactor: this.personalTimeFactor,
        overheadFactor: effectiveOverheadFactor,
        materialWasteFactor: this.materialWasteFactor,
      },
    }
  }
}

// =====================================================
// Standalone Calculation Functions
// =====================================================

// Re-export from centralized format utilities
export { formatTimeSeconds } from '@/lib/utils/format'

/**
 * Format time seconds to decimal hours
 */
export function secondsToHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100
}

/**
 * Convert minutes to seconds
 */
export function minutesToSeconds(minutes: number): number {
  return minutes * 60
}

/**
 * Convert hours to seconds
 */
export function hoursToSeconds(hours: number): number {
  return hours * 3600
}

// Re-export centralized formatter for backward compatibility
export { formatCurrency as formatDKK } from '@/lib/utils/format'

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Calculate simple DB metrics
 */
export function calculateDBMetrics(
  netPrice: number,
  costPrice: number,
  laborHours: number
): { dbAmount: number; dbPercentage: number; dbPerHour: number } {
  const dbAmount = netPrice - costPrice
  const dbPercentage = netPrice > 0 ? (dbAmount / netPrice) * 100 : 0
  const dbPerHour = laborHours > 0 ? dbAmount / laborHours : 0

  return { dbAmount, dbPercentage, dbPerHour }
}

/**
 * Create a default calculation context
 */
export function createDefaultContext(
  hourlyRate: number = DEFAULT_HOURLY_RATE,
  buildingProfile: KalkiaBuildingProfile | null = null,
  globalFactors: KalkiaGlobalFactor[] = []
): CalculationContext {
  return {
    buildingProfile,
    globalFactors,
    hourlyRate,
  }
}
