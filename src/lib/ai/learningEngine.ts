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
import { logger } from '@/lib/utils/logger'

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

  // Get feedback records (capped for safety)
  const { data: feedback } = await supabase
    .from('calculation_feedback')
    .select('*')
    .not('actual_hours', 'is', null)
    .limit(1000)

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

  // Get calculations with feedback (capped for safety)
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
    .limit(500)

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
    const feedback = calc.calculation_feedback as { actual_hours: number }[] | null
    if (!feedback || !feedback[0]?.actual_hours) continue

    const actualHours = feedback[0].actual_hours
    const estimatedHours = calc.total_hours
    if (!estimatedHours || estimatedHours === 0) continue
    const ratio = actualHours / estimatedHours

    // Distribute actual time proportionally to components
    const components = calc.components as { code: string; time_minutes?: number; quantity: number }[] | null
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

  // Get feedback for similar complexity projects (capped for safety)
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
    .limit(500)

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
  const supabase = await createClient()

  // Store in calculation_feedback as audit trail
  const { error } = await supabase
    .from('calculation_feedback')
    .insert({
      lessons_learned: `Kalibrering: ${adjustment.component || adjustment.factor} ${adjustment.type} justeret fra ${adjustment.old_value} til ${adjustment.new_value}`,
      adjustment_suggestions: [{
        ...adjustment,
        applied_at: new Date().toISOString(),
      }],
    })

  if (error) {
    logger.error('Failed to record calibration adjustment', { error, metadata: { type: adjustment.type, component: adjustment.component || adjustment.factor } })
  } else {
    logger.info('Calibration adjustment recorded', { metadata: { type: adjustment.type, component: adjustment.component || adjustment.factor } })
  }
}

// =====================================================
// Auto-Calibration
// =====================================================

/**
 * Analyze component calibrations and return suggested adjustments.
 * Does NOT apply changes - use learning.ts runAutoCalibrationAndApply() for that.
 */
export async function autoCalibrate(): Promise<Adjustment[]> {
  const adjustments: Adjustment[] = []

  const componentCalibrations = await analyzeComponentCalibration()

  for (const cal of componentCalibrations) {
    // Only suggest if confidence is high and variance is significant
    if (cal.confidence >= 0.8 && Math.abs(cal.variance_percentage) > 15) {
      adjustments.push({
        type: 'time',
        component: cal.code,
        old_value: cal.current_time_minutes,
        new_value: cal.suggested_time_minutes,
        reason: `${cal.sample_size} projekter viste ${cal.variance_percentage > 0 ? 'underestimering' : 'overestimering'} på ${Math.abs(cal.variance_percentage).toFixed(1)}%`,
        applied_at: new Date().toISOString(),
      })
    }
  }

  return adjustments
}

/**
 * Collect feedback from completed projects automatically.
 * Finds projects with actual_hours that don't have feedback records yet.
 * Returns the number of new feedback records created.
 */
export async function collectFeedbackFromProjects(): Promise<number> {
  const supabase = await createClient()

  // Find completed projects with actual hours
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      id, name, actual_hours, offer_id,
      offers!inner (id, status)
    `)
    .eq('status', 'completed')
    .gt('actual_hours', 0)
    .limit(50)

  if (!projects || projects.length === 0) return 0

  // Batch-load: collect offer IDs, then fetch calcs + existing feedback in 2 queries
  const offerIds: string[] = []
  for (const project of projects) {
    const offer = Array.isArray(project.offers) ? project.offers[0] : project.offers
    if (offer?.id) offerIds.push(offer.id)
  }

  const { data: allCalcs } = await supabase
    .from('auto_calculations')
    .select('id, offer_id, total_hours, material_cost')
    .in('offer_id', offerIds)
    .limit(100)

  const calcsByOfferId = new Map<string, { id: string; offer_id: string; total_hours: number; material_cost: number }>()
  for (const calc of allCalcs || []) {
    calcsByOfferId.set(calc.offer_id, calc)
  }

  const calcIds = Array.from(calcsByOfferId.values()).map(c => c.id)
  const { data: existingFeedbacks } = calcIds.length > 0
    ? await supabase
        .from('calculation_feedback')
        .select('calculation_id')
        .in('calculation_id', calcIds)
        .limit(100)
    : { data: [] }

  const existingCalcIds = new Set((existingFeedbacks || []).map(f => f.calculation_id))

  let created = 0

  for (const project of projects) {
    const offer = Array.isArray(project.offers) ? project.offers[0] : project.offers
    if (!offer) continue

    const calc = calcsByOfferId.get(offer.id)
    if (!calc) continue
    if (existingCalcIds.has(calc.id)) continue

    const estimatedHours = calc.total_hours || 0
    const actualHours = project.actual_hours || 0
    const variance = estimatedHours > 0
      ? ((actualHours - estimatedHours) / estimatedHours) * 100
      : null

    const { error } = await supabase
      .from('calculation_feedback')
      .insert({
        calculation_id: calc.id,
        offer_id: offer.id,
        project_id: project.id,
        estimated_hours: estimatedHours,
        actual_hours: actualHours,
        hours_variance_percentage: variance !== null ? Math.round(variance * 10) / 10 : null,
        estimated_material_cost: calc.material_cost,
        offer_accepted: (offer as { status: string }).status === 'accepted',
        project_profitable: actualHours <= estimatedHours * 1.1,
        lessons_learned: `Auto-indsamlet fra projekt "${project.name}"`,
      })

    if (!error) created++
  }

  if (created > 0) {
    logger.info(`Auto-collected ${created} feedback records from completed projects`)
  }

  return created
}
