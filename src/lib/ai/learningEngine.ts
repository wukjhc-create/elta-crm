/**
 * Learning Engine
 *
 * Self-improving calculation calibration based on:
 * - Accepted vs rejected offers
 * - Actual hours vs estimated hours
 * - Actual material costs vs estimated
 * - Customer satisfaction scores
 *
 * Uses this data to adjust:
 * - Time estimates per component
 * - Complexity multipliers
 * - Risk buffer percentages
 * - Default margins
 */

import { createClient } from '@/lib/supabase/server'

// =====================================================
// Types
// =====================================================

export interface LearningMetrics {
  // Sample size
  total_calculations: number
  completed_projects: number

  // Accuracy metrics
  avg_hours_variance: number // percentage over/under
  avg_material_variance: number
  avg_price_accuracy: number // how close to accepted price

  // Success metrics
  offer_acceptance_rate: number
  project_profitability_rate: number
  avg_customer_satisfaction: number

  // Trends
  improving: boolean
  recent_adjustments: Adjustment[]
}

export interface Adjustment {
  type: 'time' | 'material' | 'margin' | 'risk_buffer' | 'complexity'
  component?: string
  factor?: string
  old_value: number
  new_value: number
  reason: string
  applied_at: string
}

export interface ComponentCalibration {
  code: string
  suggested_time_minutes: number
  current_time_minutes: number
  variance_percentage: number
  sample_size: number
  confidence: number
}

export interface ComplexityCalibration {
  factor_code: string
  suggested_multiplier: number
  current_multiplier: number
  variance_percentage: number
  sample_size: number
}

// =====================================================
// Analysis Functions
// =====================================================

/**
 * Analyze all feedback to generate learning metrics
 */
export async function analyzeLearningMetrics(): Promise<LearningMetrics> {
  const supabase = await createClient()

  // Get all feedback records
  const { data: feedback } = await supabase
    .from('calculation_feedback')
    .select('*')
    .not('actual_hours', 'is', null)

  if (!feedback || feedback.length === 0) {
    return getDefaultMetrics()
  }

  // Calculate metrics
  const withHours = feedback.filter((f) => f.actual_hours !== null && f.estimated_hours !== null)
  const withMaterials = feedback.filter(
    (f) => f.actual_material_cost !== null && f.estimated_material_cost !== null
  )
  const withOutcome = feedback.filter((f) => f.offer_accepted !== null)
  const withProfit = feedback.filter((f) => f.project_profitable !== null)
  const withSatisfaction = feedback.filter((f) => f.customer_satisfaction !== null)

  const avgHoursVariance =
    withHours.length > 0
      ? withHours.reduce((sum, f) => {
          const variance = ((f.actual_hours - f.estimated_hours) / f.estimated_hours) * 100
          return sum + variance
        }, 0) / withHours.length
      : 0

  const avgMaterialVariance =
    withMaterials.length > 0
      ? withMaterials.reduce((sum, f) => {
          const variance =
            ((f.actual_material_cost - f.estimated_material_cost) / f.estimated_material_cost) * 100
          return sum + variance
        }, 0) / withMaterials.length
      : 0

  const offerAcceptanceRate =
    withOutcome.length > 0
      ? (withOutcome.filter((f) => f.offer_accepted).length / withOutcome.length) * 100
      : 0

  const profitabilityRate =
    withProfit.length > 0
      ? (withProfit.filter((f) => f.project_profitable).length / withProfit.length) * 100
      : 0

  const avgSatisfaction =
    withSatisfaction.length > 0
      ? withSatisfaction.reduce((sum, f) => sum + f.customer_satisfaction, 0) /
        withSatisfaction.length
      : 0

  // Price accuracy (how close our estimates were to reality)
  const priceAccuracy = 100 - Math.abs(avgHoursVariance) - Math.abs(avgMaterialVariance) / 2

  // Determine if we're improving (compare last 10 vs previous 10)
  const sorted = feedback.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const recent = sorted.slice(0, 10)
  const previous = sorted.slice(10, 20)

  const recentAccuracy =
    recent.length > 0
      ? recent
          .filter((f) => f.hours_variance_percentage !== null)
          .reduce((sum, f) => sum + Math.abs(f.hours_variance_percentage || 0), 0) / recent.length
      : 100

  const previousAccuracy =
    previous.length > 0
      ? previous
          .filter((f) => f.hours_variance_percentage !== null)
          .reduce((sum, f) => sum + Math.abs(f.hours_variance_percentage || 0), 0) / previous.length
      : 100

  const improving = recentAccuracy < previousAccuracy

  return {
    total_calculations: feedback.length,
    completed_projects: withHours.length,
    avg_hours_variance: Math.round(avgHoursVariance * 10) / 10,
    avg_material_variance: Math.round(avgMaterialVariance * 10) / 10,
    avg_price_accuracy: Math.round(priceAccuracy * 10) / 10,
    offer_acceptance_rate: Math.round(offerAcceptanceRate * 10) / 10,
    project_profitability_rate: Math.round(profitabilityRate * 10) / 10,
    avg_customer_satisfaction: Math.round(avgSatisfaction * 10) / 10,
    improving,
    recent_adjustments: await loadRecentAdjustments(supabase),
  }
}

async function loadRecentAdjustments(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Adjustment[]> {
  const { data } = await supabase
    .from('calculation_feedback')
    .select('adjustment_suggestions, created_at')
    .not('adjustment_suggestions', 'eq', '[]')
    .order('created_at', { ascending: false })
    .limit(10)

  if (!data) return []

  const adjustments: Adjustment[] = []
  for (const row of data) {
    const suggestions = row.adjustment_suggestions as Array<{
      type: string
      component?: string
      factor?: string
      old_value: number
      new_value: number
      reason: string
      applied_at?: string
    }>
    if (Array.isArray(suggestions)) {
      for (const s of suggestions) {
        adjustments.push({
          type: s.type as Adjustment['type'],
          component: s.component,
          factor: s.factor,
          old_value: s.old_value,
          new_value: s.new_value,
          reason: s.reason,
          applied_at: s.applied_at || row.created_at,
        })
      }
    }
  }
  return adjustments
}

function getDefaultMetrics(): LearningMetrics {
  return {
    total_calculations: 0,
    completed_projects: 0,
    avg_hours_variance: 0,
    avg_material_variance: 0,
    avg_price_accuracy: 100,
    offer_acceptance_rate: 0,
    project_profitability_rate: 0,
    avg_customer_satisfaction: 0,
    improving: true,
    recent_adjustments: [],
  }
}

/**
 * Analyze component-level calibration needs
 */
export async function analyzeComponentCalibration(): Promise<ComponentCalibration[]> {
  const supabase = await createClient()

  // Get calculations with feedback
  const { data: calculations } = await supabase
    .from('auto_calculations')
    .select(
      `
      id,
      components,
      total_hours,
      calculation_feedback(actual_hours)
    `
    )
    .not('calculation_feedback.actual_hours', 'is', null)

  if (!calculations || calculations.length === 0) {
    return []
  }

  // Aggregate by component code
  const componentData: Record<
    string,
    {
      total_estimated: number
      total_actual: number
      count: number
      current_time: number
    }
  > = {}

  for (const calc of calculations) {
    const feedback = calc.calculation_feedback as any
    if (!feedback || !feedback[0]?.actual_hours) continue

    const actualHours = feedback[0].actual_hours
    const estimatedHours = calc.total_hours
    const ratio = actualHours / estimatedHours

    // Distribute actual time proportionally to components
    const components = calc.components as any[]
    for (const comp of components || []) {
      const code = comp.code
      const estimatedMinutes = comp.time_minutes || 30
      const actualMinutes = estimatedMinutes * ratio

      if (!componentData[code]) {
        componentData[code] = {
          total_estimated: 0,
          total_actual: 0,
          count: 0,
          current_time: estimatedMinutes / comp.quantity,
        }
      }

      componentData[code].total_estimated += estimatedMinutes
      componentData[code].total_actual += actualMinutes
      componentData[code].count++
    }
  }

  // Generate calibration suggestions
  const calibrations: ComponentCalibration[] = []

  for (const [code, data] of Object.entries(componentData)) {
    if (data.count < 3) continue // Need minimum sample size

    const avgEstimated = data.total_estimated / data.count
    const avgActual = data.total_actual / data.count
    const variance = ((avgActual - avgEstimated) / avgEstimated) * 100

    // Only suggest if variance is significant (>10%)
    if (Math.abs(variance) > 10) {
      calibrations.push({
        code,
        suggested_time_minutes: Math.round(avgActual / data.count),
        current_time_minutes: Math.round(data.current_time),
        variance_percentage: Math.round(variance * 10) / 10,
        sample_size: data.count,
        confidence: Math.min(data.count / 10, 1), // Full confidence at 10 samples
      })
    }
  }

  return calibrations.sort((a, b) => Math.abs(b.variance_percentage) - Math.abs(a.variance_percentage))
}

/**
 * Get suggested risk buffer based on history
 */
export async function getSuggestedRiskBuffer(complexityScore: number): Promise<number> {
  const supabase = await createClient()

  // Get feedback for similar complexity projects
  const { data: feedback } = await supabase
    .from('calculation_feedback')
    .select(
      `
      hours_variance_percentage,
      material_variance_percentage,
      auto_calculations!inner(
        interpretation_id,
        risk_buffer_percentage
      )
    `
    )
    .not('hours_variance_percentage', 'is', null)

  if (!feedback || feedback.length < 5) {
    // Not enough data, use defaults based on complexity
    const defaults = [0, 3, 5, 7.5, 10, 15]
    return defaults[complexityScore] || 5
  }

  // Calculate average overrun
  const overruns = feedback
    .map((f) => {
      const hoursOver = f.hours_variance_percentage || 0
      const materialsOver = f.material_variance_percentage || 0
      return Math.max(hoursOver, materialsOver)
    })
    .filter((v) => v > 0)

  if (overruns.length === 0) {
    return 5 // Default
  }

  // Suggest buffer that would cover 80% of overruns
  overruns.sort((a, b) => a - b)
  const p80Index = Math.floor(overruns.length * 0.8)
  const p80Value = overruns[p80Index] || 10

  // Adjust for complexity
  const complexityFactor = 1 + (complexityScore - 3) * 0.1

  return Math.round(p80Value * complexityFactor * 10) / 10
}

/**
 * Record an adjustment made to the system
 */
export async function recordAdjustment(adjustment: Omit<Adjustment, 'applied_at'>): Promise<void> {
  // Log adjustment - could be expanded to store in database
  console.info('Calibration adjustment applied:', adjustment.type, adjustment.component || adjustment.factor)
}

// =====================================================
// Auto-Calibration (for future use)
// =====================================================

/**
 * Apply automatic calibrations based on learning
 * This should be run periodically (e.g., weekly)
 */
export async function autoCalibrate(): Promise<Adjustment[]> {
  const adjustments: Adjustment[] = []

  // Analyze component times
  const componentCalibrations = await analyzeComponentCalibration()

  for (const cal of componentCalibrations) {
    // Only auto-adjust if confidence is high and variance is significant
    if (cal.confidence >= 0.8 && Math.abs(cal.variance_percentage) > 15) {
      // In production, this would update the database
      adjustments.push({
        type: 'time',
        component: cal.code,
        old_value: cal.current_time_minutes,
        new_value: cal.suggested_time_minutes,
        reason: `${cal.sample_size} projekterer viste ${cal.variance_percentage > 0 ? 'underestimering' : 'overestimering'} på ${Math.abs(cal.variance_percentage)}%`,
        applied_at: new Date().toISOString(),
      })
    }
  }

  return adjustments
}
