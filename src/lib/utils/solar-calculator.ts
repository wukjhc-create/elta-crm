/**
 * Solar Calculator V2 - Database-driven calculation engine
 *
 * This replaces the hardcoded calculator with a context-based approach
 * that uses products and assumptions from the database.
 */

import { logger } from '@/lib/utils/logger'
import type {
  SolarAssumptions,
  PanelProduct,
  InverterProduct,
  BatteryProduct,
  MountingProduct,
  CalculatorInputV2,
  SolarProductsByType,
  PanelSpecs,
  InverterSpecs,
  BatterySpecs,
  MountingSpecs,
} from '@/types/solar-products.types'
import type { CalculatorResults, YearlyProjection } from '@/types/calculator.types'

// =============================================================================
// TYPES
// =============================================================================

export interface SolarCalculatorContext {
  assumptions: SolarAssumptions
  products: {
    panel: PanelProduct
    inverter: InverterProduct
    mounting: MountingProduct
    battery: BatteryProduct
  }
}

// =============================================================================
// CONTEXT BUILDER
// =============================================================================

/**
 * Build calculator context from products and input
 * Returns null if any required product is not found
 */
export function buildCalculatorContext(
  productsByType: SolarProductsByType,
  assumptions: SolarAssumptions,
  input: CalculatorInputV2
): SolarCalculatorContext | null {
  const panel = productsByType.panels.find((p) => p.code === input.panelCode)
  const inverter = productsByType.inverters.find((p) => p.code === input.inverterCode)
  const mounting = productsByType.mountings.find((p) => p.code === input.mountingCode)
  const battery = productsByType.batteries.find((p) => p.code === input.batteryCode)

  if (!panel || !inverter || !mounting || !battery) {
    logger.error('Missing products for calculator context', {
      metadata: {
        panel: input.panelCode,
        inverter: input.inverterCode,
        mounting: input.mountingCode,
        battery: input.batteryCode,
      },
    })
    return null
  }

  return {
    assumptions,
    products: { panel, inverter, mounting, battery },
  }
}

// =============================================================================
// MAIN CALCULATION ENGINE
// =============================================================================

/**
 * Calculate solar system results using database-driven products and assumptions
 */
export function calculateSolarSystemV2(
  input: CalculatorInputV2,
  context: SolarCalculatorContext
): CalculatorResults {
  const { panel, inverter, mounting, battery } = context.products
  const assumptions = context.assumptions

  // Extract specs with type safety
  const panelSpecs = panel.specifications as PanelSpecs
  const inverterSpecs = inverter.specifications as InverterSpecs
  const batterySpecs = battery.specifications as BatterySpecs
  const mountingSpecs = mounting.specifications as MountingSpecs

  // System specifications
  const systemSize = (panelSpecs.wattage * input.panelCount) / 1000 // kWp
  const baseAnnualProduction =
    systemSize *
    assumptions.annualSunHours *
    panelSpecs.efficiency *
    inverterSpecs.efficiency *
    1000 // kWh

  // Cost calculations
  const panelsCost = panel.price * input.panelCount
  const inverterCost = inverter.price
  const mountingCost = mountingSpecs.price_per_panel * input.panelCount
  const batteryCost = battery.price
  const laborHours = mountingSpecs.labor_hours_per_panel * input.panelCount
  const laborCost = laborHours * assumptions.laborCostPerHour
  const installationCost = assumptions.baseInstallationCost

  const subtotal =
    panelsCost + inverterCost + mountingCost + batteryCost + laborCost + installationCost

  // VAT rate is 25% (hardcoded as it's a legal constant)
  const vatRate = 0.25

  const marginAmount = subtotal * input.margin
  const discountAmount = (subtotal + marginAmount) * input.discount
  const totalBeforeVat = subtotal + marginAmount - discountAmount
  const vatAmount = input.includeVat ? totalBeforeVat * vatRate : 0
  const totalPrice = totalBeforeVat + vatAmount
  const pricePerWp = totalPrice / (systemSize * 1000)

  // Self-consumption ratio based on battery
  const selfConsumptionRatio =
    batterySpecs.capacity > 0
      ? assumptions.selfConsumptionRatioWithBattery
      : assumptions.selfConsumptionRatio

  // Calculate yearly projections
  const yearlyProjections: YearlyProjection[] = []
  let cumulativeSavings = 0

  for (let year = 1; year <= assumptions.systemLifetime; year++) {
    // Production degrades each year
    const degradationFactor = Math.pow(1 - assumptions.annualDegradation, year - 1)
    const production = baseAnnualProduction * degradationFactor

    // Electricity price increases each year
    const electricityPrice =
      assumptions.electricityPrice *
      Math.pow(1 + assumptions.electricityPriceIncrease, year - 1)

    // Savings calculation
    const selfConsumed = production * selfConsumptionRatio
    const exported = production * (1 - selfConsumptionRatio)
    const selfConsumptionSavings = selfConsumed * electricityPrice
    const feedInIncome = exported * assumptions.feedInTariff
    const yearSavings = selfConsumptionSavings + feedInIncome

    cumulativeSavings += yearSavings

    // System value (depreciated linearly)
    const systemValue = totalPrice * (1 - year / assumptions.systemLifetime)

    yearlyProjections.push({
      year,
      production: Math.round(production),
      savings: Math.round(yearSavings),
      cumulativeSavings: Math.round(cumulativeSavings),
      systemValue: Math.round(systemValue),
    })
  }

  // First year values
  const firstYear = yearlyProjections[0]
  const annualProduction = firstYear.production
  const annualSavings = firstYear.savings

  // Split savings for display
  const selfConsumed = annualProduction * selfConsumptionRatio
  const exported = annualProduction * (1 - selfConsumptionRatio)
  const selfConsumptionSavings = selfConsumed * assumptions.electricityPrice
  const feedInIncome = exported * assumptions.feedInTariff

  // ROI calculations
  const paybackYears =
    yearlyProjections.findIndex((p) => p.cumulativeSavings >= totalPrice) + 1 ||
    assumptions.systemLifetime
  const roi25Years =
    ((yearlyProjections[assumptions.systemLifetime - 1].cumulativeSavings - totalPrice) /
      totalPrice) *
    100

  // CO2 savings
  const co2SavingsPerYear = annualProduction * assumptions.co2Factor

  return {
    systemSize: Math.round(systemSize * 100) / 100,
    annualProduction: Math.round(annualProduction),
    panelsCost,
    inverterCost,
    mountingCost,
    batteryCost,
    laborCost: Math.round(laborCost),
    installationCost,
    subtotal,
    margin: Math.round(marginAmount),
    discount: Math.round(discountAmount),
    totalBeforeVat: Math.round(totalBeforeVat),
    vat: Math.round(vatAmount),
    totalPrice: Math.round(totalPrice),
    pricePerWp: Math.round(pricePerWp * 100) / 100,
    annualSavings: Math.round(annualSavings),
    selfConsumptionSavings: Math.round(selfConsumptionSavings),
    feedInIncome: Math.round(feedInIncome),
    paybackYears,
    roi25Years: Math.round(roi25Years),
    co2SavingsPerYear: Math.round(co2SavingsPerYear),
    yearlyProjections,
  }
}

// =============================================================================
// LEGACY CONVERSION HELPERS
// =============================================================================

import type { CalculatorInput } from '@/types/calculator.types'
import {
  LEGACY_PANEL_CODE_MAP,
  LEGACY_INVERTER_CODE_MAP,
  LEGACY_BATTERY_CODE_MAP,
  LEGACY_MOUNTING_CODE_MAP,
  DEFAULT_SOLAR_ASSUMPTIONS,
} from '@/types/solar-products.types'

/**
 * Convert legacy calculator input to V2 format
 */
export function convertLegacyToV2(legacy: CalculatorInput): CalculatorInputV2 {
  return {
    panelCode: LEGACY_PANEL_CODE_MAP[legacy.panelType] || 'PANEL-STD',
    panelCount: legacy.panelCount,
    inverterCode: LEGACY_INVERTER_CODE_MAP[legacy.inverterType] || 'INV-STRING-5KW',
    mountingCode: LEGACY_MOUNTING_CODE_MAP[legacy.mountingType] || 'MOUNT-TILE',
    batteryCode: LEGACY_BATTERY_CODE_MAP[legacy.batteryOption] || 'BAT-NONE',
    annualConsumption: legacy.annualConsumption,
    margin: legacy.margin,
    discount: legacy.discount,
    includeVat: legacy.includeVat,
  }
}

/**
 * Convert V2 input back to legacy format (for backward compatibility)
 */
export function convertV2ToLegacy(v2: CalculatorInputV2): CalculatorInput {
  // Reverse lookup in maps
  const findLegacyKey = (map: Record<string, string>, code: string): string => {
    return Object.entries(map).find(([, v]) => v === code)?.[0] || Object.keys(map)[0]
  }

  return {
    panelType: findLegacyKey(LEGACY_PANEL_CODE_MAP, v2.panelCode) as CalculatorInput['panelType'],
    panelCount: v2.panelCount,
    inverterType: findLegacyKey(
      LEGACY_INVERTER_CODE_MAP,
      v2.inverterCode
    ) as CalculatorInput['inverterType'],
    mountingType: findLegacyKey(
      LEGACY_MOUNTING_CODE_MAP,
      v2.mountingCode
    ) as CalculatorInput['mountingType'],
    batteryOption: findLegacyKey(
      LEGACY_BATTERY_CODE_MAP,
      v2.batteryCode
    ) as CalculatorInput['batteryOption'],
    annualConsumption: v2.annualConsumption,
    margin: v2.margin,
    discount: v2.discount,
    includeVat: v2.includeVat,
  }
}

/**
 * Get default V2 input with first available products
 */
export function getDefaultInputV2(products: SolarProductsByType): CalculatorInputV2 {
  return {
    panelCode: products.panels[0]?.code || 'PANEL-STD',
    panelCount: 12,
    inverterCode: products.inverters[1]?.code || products.inverters[0]?.code || 'INV-STRING-5KW',
    mountingCode: products.mountings[0]?.code || 'MOUNT-TILE',
    batteryCode: products.batteries[0]?.code || 'BAT-NONE',
    annualConsumption: 4000,
    margin: DEFAULT_SOLAR_ASSUMPTIONS.laborCostPerHour > 0 ? 0.25 : 0.25, // Default 25% margin
    discount: 0,
    includeVat: true,
  }
}
