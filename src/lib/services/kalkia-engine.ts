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
import type { CableSizingResult } from '@/types/electrical.types'
import { calculateCableSize } from '@/lib/services/electrical-engine'
import { calculateSalePrice } from '@/lib/logic/pricing'
import { CALC_DEFAULTS } from '@/lib/constants'

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
      salePrice = calculateSalePrice(totalCost, CALC_DEFAULTS.MARGINS.DEFAULT_DB_TARGET) // fallback markup
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

  // =====================================================
  // Electrical Enrichment
  // =====================================================

  /**
   * Enrich a calculated item with cable sizing information.
   * Uses the electrical engine to determine optimal cable size based on
   * the node's electrical properties (if available in conditions).
   *
   * @param item - The calculated item to enrich
   * @param powerWatts - Power consumption in watts (from node metadata or conditions)
   * @param cableLength - Cable run length in meters
   * @param installationMethod - Installation method code (default B2)
   * @returns The item with cable_sizing and any warnings
   */
  enrichWithCableSizing(
    item: CalculatedItem,
    powerWatts: number,
    cableLength: number,
    installationMethod: 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'E' | 'F' = 'B2'
  ): CalculatedItem & { cable_sizing?: CableSizingResult; electrical_warnings?: string[] } {
    if (powerWatts <= 0 || cableLength <= 0) {
      return item
    }

    const is3Phase = powerWatts > 3680 // Over 16A on single phase → likely 3-phase
    const voltage = is3Phase ? 400 : 230
    const phase = is3Phase ? '3-phase' as const : '1-phase' as const

    const cableSizing = calculateCableSize({
      power_watts: powerWatts,
      voltage,
      phase,
      power_factor: 1.0,
      length_meters: cableLength,
      installation_method: installationMethod,
      core_count: 3,
      cable_type: 'PVT',
    })

    const electrical_warnings: string[] = [...cableSizing.warnings]

    // Add cable cost to material cost
    const enrichedItem = {
      ...item,
      materialCost: item.materialCost + cableSizing.total_cable_cost,
      totalCost: item.totalCost + cableSizing.total_cable_cost,
      cable_sizing: cableSizing,
      electrical_warnings,
    }

    return enrichedItem
  }

  /**
   * Calculate full pricing with electrical analysis summary.
   * Extends calculateFinalPricing with cable and compliance info.
   */
  calculateFinalPricingWithElectrical(
    items: (CalculatedItem & { cable_sizing?: CableSizingResult; electrical_warnings?: string[] })[],
    marginPercentage?: number,
    discountPercentage?: number,
    vatPercentage?: number,
    riskPercentage?: number
  ): CalculationResult & {
    electrical_summary?: {
      total_cable_cost: number
      total_cable_meters: number
      cable_types: string[]
      warnings: string[]
      all_compliant: boolean
    }
  } {
    const baseResult = this.calculateFinalPricing(
      items, marginPercentage, discountPercentage, vatPercentage, riskPercentage
    )

    const itemsWithCable = items.filter(i => i.cable_sizing)

    if (itemsWithCable.length === 0) {
      return baseResult
    }

    const totalCableCost = itemsWithCable.reduce((s, i) => s + (i.cable_sizing?.total_cable_cost ?? 0), 0)
    const totalCableMeters = itemsWithCable.reduce((s, i) => {
      const sizing = i.cable_sizing
      if (!sizing) return s
      // Cable length isn't directly stored; estimate from cost
      return s + (sizing.cost_per_meter > 0 ? sizing.total_cable_cost / sizing.cost_per_meter : 0)
    }, 0)

    const cableTypes = [...new Set(itemsWithCable.map(i => i.cable_sizing?.cable_designation).filter(Boolean) as string[])]
    const warnings = itemsWithCable.flatMap(i => i.electrical_warnings ?? [])
    const allCompliant = itemsWithCable.every(i => i.cable_sizing?.compliant !== false)

    return {
      ...baseResult,
      electrical_summary: {
        total_cable_cost: Math.round(totalCableCost * 100) / 100,
        total_cable_meters: Math.round(totalCableMeters * 100) / 100,
        cable_types: cableTypes,
        warnings: [...new Set(warnings)],
        all_compliant: allCompliant,
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
