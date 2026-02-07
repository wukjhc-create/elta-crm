/**
 * Calculation Engine V2
 *
 * Professional calculation logic for time and price:
 * - Base time from components
 * - Complexity multipliers (concrete, brick, drywall)
 * - Size factor (building area)
 * - Accessibility factor (height, crawl space, attic)
 * - Material costs from suppliers
 * - Labor costs
 * - Margin rules
 * - Risk buffer
 */

import type {
  ProjectInterpretation,
  CalculationComponent,
  CalculationMaterial,
  TimeCalculation,
  PriceCalculation,
  AutoCalculation,
  ComplexityFactor,
} from '@/types/auto-project.types'

// =====================================================
// Configuration
// =====================================================

const DEFAULT_HOURLY_RATE = 450 // DKK per hour
const DEFAULT_MARGIN_PERCENTAGE = 25
const DEFAULT_RISK_BUFFER_PERCENTAGE = 5

// Size factors (m²)
const SIZE_FACTORS: { max: number; factor: number }[] = [
  { max: 50, factor: 0.9 }, // Small - slightly faster per point
  { max: 100, factor: 1.0 }, // Standard
  { max: 150, factor: 1.05 }, // Medium
  { max: 200, factor: 1.1 }, // Larger
  { max: 300, factor: 1.15 }, // Large
  { max: Infinity, factor: 1.2 }, // Very large
]

// Complexity category multipliers (combined if multiple apply)
const COMPLEXITY_WEIGHTS: Record<string, number> = {
  material: 0.5, // Wall material is most important
  building: 0.3, // Building age/type
  access: 0.15, // Accessibility
  electrical: 0.05, // Electrical complexity
}

// =====================================================
// Time Calculation
// =====================================================

function calculateSizeMultiplier(size_m2: number | null): number {
  const size = size_m2 || 100

  for (const { max, factor } of SIZE_FACTORS) {
    if (size <= max) {
      return factor
    }
  }

  return 1.2
}

function calculateComplexityMultiplier(factors: ComplexityFactor[]): number {
  if (factors.length === 0) {
    return 1.0
  }

  // Group by category
  const byCategory: Record<string, ComplexityFactor[]> = {}

  for (const factor of factors) {
    const cat = factor.category || 'other'
    if (!byCategory[cat]) {
      byCategory[cat] = []
    }
    byCategory[cat].push(factor)
  }

  // Calculate weighted average
  let totalWeight = 0
  let weightedSum = 0

  for (const [category, catFactors] of Object.entries(byCategory)) {
    const weight = COMPLEXITY_WEIGHTS[category] || 0.1

    // Take the highest multiplier in each category
    const maxMultiplier = Math.max(...catFactors.map(f => f.multiplier))

    totalWeight += weight
    weightedSum += weight * maxMultiplier
  }

  if (totalWeight === 0) {
    return 1.0
  }

  // Normalize and add variance from 1.0
  const avgMultiplier = weightedSum / totalWeight
  const deviation = avgMultiplier - 1.0

  // Apply 80% of the deviation to avoid extreme values
  return 1.0 + deviation * 0.8
}

function calculateAccessibilityMultiplier(factors: ComplexityFactor[]): number {
  const accessFactors = factors.filter(f => f.category === 'access')

  if (accessFactors.length === 0) {
    return 1.0
  }

  // Combine accessibility factors
  let multiplier = 1.0

  for (const factor of accessFactors) {
    // Additive for accessibility (can stack)
    multiplier += (factor.multiplier - 1.0) * 0.7
  }

  return Math.min(multiplier, 1.5) // Cap at 1.5x
}

function calculateBaseHours(components: CalculationComponent[]): {
  total: number
  breakdown: { category: string; hours: number; description: string }[]
} {
  const categoryMinutes: Record<string, number> = {}
  const categoryNames: Record<string, string> = {
    outlet: 'Stikkontakter',
    switch: 'Afbrydere',
    lighting: 'Belysning',
    power: 'Kraftinstallation',
    data: 'Data/TV',
    panel: 'Tavlearbejde',
  }

  for (const comp of components) {
    const cat = comp.category || 'other'
    categoryMinutes[cat] = (categoryMinutes[cat] || 0) + comp.time_minutes
  }

  const breakdown = Object.entries(categoryMinutes).map(([category, minutes]) => ({
    category,
    hours: Math.round((minutes / 60) * 100) / 100,
    description: categoryNames[category] || category,
  }))

  const total = Object.values(categoryMinutes).reduce((sum, m) => sum + m, 0) / 60

  return { total, breakdown }
}

export function calculateTime(
  components: CalculationComponent[],
  interpretation: ProjectInterpretation
): TimeCalculation {
  const { total: baseHours, breakdown } = calculateBaseHours(components)

  const complexity_multiplier = calculateComplexityMultiplier(interpretation.complexity_factors)
  const size_multiplier = calculateSizeMultiplier(interpretation.building_size_m2)
  const accessibility_multiplier = calculateAccessibilityMultiplier(interpretation.complexity_factors)

  const total_hours =
    baseHours * complexity_multiplier * size_multiplier * accessibility_multiplier

  return {
    base_hours: Math.round(baseHours * 100) / 100,
    complexity_multiplier: Math.round(complexity_multiplier * 100) / 100,
    size_multiplier: Math.round(size_multiplier * 100) / 100,
    accessibility_multiplier: Math.round(accessibility_multiplier * 100) / 100,
    total_hours: Math.round(total_hours * 100) / 100,
    breakdown,
  }
}

// =====================================================
// Price Calculation
// =====================================================

export function calculatePrice(
  components: CalculationComponent[],
  materials: CalculationMaterial[],
  timeCalc: TimeCalculation,
  options?: {
    hourly_rate?: number
    margin_percentage?: number
    risk_buffer_percentage?: number
  }
): PriceCalculation {
  const hourly_rate = options?.hourly_rate || DEFAULT_HOURLY_RATE
  const margin_percentage = options?.margin_percentage || DEFAULT_MARGIN_PERCENTAGE
  const risk_buffer_percentage = options?.risk_buffer_percentage || DEFAULT_RISK_BUFFER_PERCENTAGE

  // Calculate material cost (use cost price)
  const material_cost = materials.reduce((sum, m) => sum + m.total_cost, 0)

  // Calculate labor cost
  const labor_cost = timeCalc.total_hours * hourly_rate

  // Subtotal before margins
  const subtotal = material_cost + labor_cost

  // Calculate margin
  const margin_amount = subtotal * (margin_percentage / 100)

  // Calculate risk buffer
  const risk_buffer_amount = subtotal * (risk_buffer_percentage / 100)

  // Total price
  const total_price = subtotal + margin_amount + risk_buffer_amount

  return {
    material_cost: Math.round(material_cost * 100) / 100,
    labor_cost: Math.round(labor_cost * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    margin_percentage,
    margin_amount: Math.round(margin_amount * 100) / 100,
    risk_buffer_percentage,
    risk_buffer_amount: Math.round(risk_buffer_amount * 100) / 100,
    total_price: Math.round(total_price * 100) / 100,
    hourly_rate,
  }
}

// =====================================================
// Full Calculation
// =====================================================

export function calculateProject(
  interpretationId: string,
  components: CalculationComponent[],
  materials: CalculationMaterial[],
  interpretation: ProjectInterpretation,
  options?: {
    hourly_rate?: number
    margin_percentage?: number
    risk_buffer_percentage?: number
  }
): Omit<AutoCalculation, 'id' | 'calculated_at'> {
  const time = calculateTime(components, interpretation)
  const price = calculatePrice(components, materials, time, options)

  return {
    interpretation_id: interpretationId,
    components,
    materials,
    time,
    price,
    calculation_version: 'v2.0',
  }
}

// =====================================================
// Utility Functions
// =====================================================

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatHours(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} min`
  }

  const wholeHours = Math.floor(hours)
  const minutes = Math.round((hours - wholeHours) * 60)

  if (minutes === 0) {
    return `${wholeHours} timer`
  }

  return `${wholeHours}t ${minutes}min`
}

export function estimateWorkdays(hours: number, hoursPerDay: number = 7.5): number {
  return Math.ceil(hours / hoursPerDay)
}

// =====================================================
// Price Adjustments
// =====================================================

export function adjustPriceForRisk(
  price: PriceCalculation,
  riskScore: number
): PriceCalculation {
  // Increase risk buffer based on risk score (1-5)
  const riskMultiplier = 1 + (riskScore - 1) * 0.025 // 0%, 2.5%, 5%, 7.5%, 10%
  const adjustedRiskBuffer = price.risk_buffer_percentage * riskMultiplier

  const subtotal = price.material_cost + price.labor_cost
  const margin_amount = subtotal * (price.margin_percentage / 100)
  const risk_buffer_amount = subtotal * (adjustedRiskBuffer / 100)
  const total_price = subtotal + margin_amount + risk_buffer_amount

  return {
    ...price,
    risk_buffer_percentage: Math.round(adjustedRiskBuffer * 100) / 100,
    risk_buffer_amount: Math.round(risk_buffer_amount * 100) / 100,
    total_price: Math.round(total_price * 100) / 100,
  }
}

export function applyDiscount(
  price: PriceCalculation,
  discountPercentage: number
): PriceCalculation & { discount_percentage: number; discount_amount: number; final_price: number } {
  const discount_amount = price.total_price * (discountPercentage / 100)
  const final_price = price.total_price - discount_amount

  return {
    ...price,
    discount_percentage: discountPercentage,
    discount_amount: Math.round(discount_amount * 100) / 100,
    final_price: Math.round(final_price * 100) / 100,
  }
}
