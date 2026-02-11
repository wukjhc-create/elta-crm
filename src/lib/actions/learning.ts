'use server'

/**
 * Learning Engine Server Actions
 *
 * Actions for the self-improving calculation system.
 */

import {
  analyzeLearningMetrics,
  analyzeComponentCalibration,
  getSuggestedRiskBuffer,
  autoCalibrate,
  type LearningMetrics,
  type ComponentCalibration,
  type Adjustment,
} from '@/lib/ai/learningEngine'
import type { ActionResult } from '@/types/common.types'
import { requireAuth, getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { revalidatePath } from 'next/cache'

// =====================================================
// Helpers
// =====================================================
// =====================================================
// Metrics Actions
// =====================================================

/**
 * Get learning metrics for the dashboard
 */
export async function getLearningMetrics(): Promise<ActionResult<LearningMetrics>> {
  try {
    await requireAuth()

    const metrics = await analyzeLearningMetrics()

    return { success: true, data: metrics }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente læringsmetrikker') }
  }
}

/**
 * Get component calibration suggestions
 */
export async function getComponentCalibrations(): Promise<ActionResult<ComponentCalibration[]>> {
  try {
    await requireAuth()

    const calibrations = await analyzeComponentCalibration()

    return { success: true, data: calibrations }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke analysere komponenter') }
  }
}

/**
 * Get suggested risk buffer for a given complexity
 */
export async function suggestRiskBuffer(
  complexityScore: number
): Promise<ActionResult<{ suggested_percentage: number }>> {
  try {
    await requireAuth()

    const suggested = await getSuggestedRiskBuffer(complexityScore)

    return { success: true, data: { suggested_percentage: suggested } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke beregne risikobuffer') }
  }
}

// =====================================================
// Calibration Actions
// =====================================================

/**
 * Run auto-calibration (admin only)
 */
export async function runAutoCalibration(): Promise<ActionResult<{ adjustments: Adjustment[] }>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (profile?.role !== 'admin') {
      return { success: false, error: 'Kun administratorer kan køre autokalibrering' }
    }

    const adjustments = await autoCalibrate()

    return { success: true, data: { adjustments } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke køre autokalibrering') }
  }
}

/**
 * Apply a manual calibration adjustment
 */
export async function applyCalibration(
  calibration: ComponentCalibration
): Promise<ActionResult<{ applied: boolean }>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (profile?.role !== 'admin') {
      return { success: false, error: 'Kun administratorer kan anvende kalibreringer' }
    }

    // Get current value for history
    const { data: currentComponent } = await supabase
      .from('calc_components')
      .select('time_estimate')
      .eq('code', calibration.code)
      .maybeSingle()

    const oldValue = currentComponent?.time_estimate || 0

    // Update calc_components time estimate
    const { error } = await supabase
      .from('calc_components')
      .update({
        time_estimate: calibration.suggested_time_minutes,
        updated_at: new Date().toISOString(),
      })
      .eq('code', calibration.code)

    if (error) {
      return { success: false, error: 'Kunne ikke opdatere komponent' }
    }

    // Record adjustment in calculation_feedback
    const reason = `Afvigelse: ${calibration.variance_percentage.toFixed(1)}%, baseret på ${calibration.sample_size} beregninger`
    await supabase
      .from('calculation_feedback')
      .insert({
        lessons_learned: `Kalibrering: ${calibration.code} tidsjustering fra ${oldValue}min til ${calibration.suggested_time_minutes}min`,
        adjustment_suggestions: [{
          type: 'time',
          component: calibration.code,
          old_value: oldValue,
          new_value: calibration.suggested_time_minutes,
          reason,
          applied_at: new Date().toISOString(),
          applied_by: userId,
        }],
      })

    revalidatePath('/dashboard/settings')
    return { success: true, data: { applied: true } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke anvende kalibrering') }
  }
}

// =====================================================
// Feedback Enhancement Actions
// =====================================================

/**
 * Record project completion feedback
 */
export async function recordProjectFeedback(
  data: {
    calculation_id: string
    offer_id?: string
    project_id?: string
    actual_hours?: number
    actual_material_cost?: number
    offer_accepted?: boolean
    project_profitable?: boolean
    customer_satisfaction?: number
    lessons_learned?: string
  }
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Get estimated values from calculation
    const { data: calc } = await supabase
      .from('auto_calculations')
      .select('total_hours, material_cost')
      .eq('id', data.calculation_id)
      .single()

    const estimated_hours = calc?.total_hours
    const estimated_material_cost = calc?.material_cost

    // Calculate variances
    const hours_variance_percentage =
      data.actual_hours && estimated_hours
        ? ((data.actual_hours - estimated_hours) / estimated_hours) * 100
        : null

    const material_variance_percentage =
      data.actual_material_cost && estimated_material_cost
        ? ((data.actual_material_cost - estimated_material_cost) / estimated_material_cost) * 100
        : null

    // Insert or update feedback
    const { data: feedback, error } = await supabase
      .from('calculation_feedback')
      .upsert(
        {
          calculation_id: data.calculation_id,
          offer_id: data.offer_id,
          project_id: data.project_id,
          estimated_hours,
          actual_hours: data.actual_hours,
          hours_variance_percentage,
          estimated_material_cost,
          actual_material_cost: data.actual_material_cost,
          material_variance_percentage,
          offer_accepted: data.offer_accepted,
          project_profitable: data.project_profitable,
          customer_satisfaction: data.customer_satisfaction,
          lessons_learned: data.lessons_learned,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'calculation_id' }
      )
      .select('id')
      .single()

    if (error) {
      return { success: false, error: 'Kunne ikke gemme feedback' }
    }

    revalidatePath('/dashboard')
    return { success: true, data: { id: feedback.id } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke registrere feedback') }
  }
}

// =====================================================
// Statistics Actions
// =====================================================

/**
 * Get accuracy trends over time
 */
export async function getAccuracyTrends(
  period: 'week' | 'month' | 'quarter' = 'month'
): Promise<
  ActionResult<{
    labels: string[]
    hours_accuracy: number[]
    material_accuracy: number[]
    acceptance_rate: number[]
  }>
> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Determine date range
    const now = new Date()
    const periods: Date[] = []
    const periodDays = period === 'week' ? 7 : period === 'month' ? 30 : 90

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i * periodDays)
      periods.push(date)
    }

    // Get feedback for each period
    const labels: string[] = []
    const hours_accuracy: number[] = []
    const material_accuracy: number[] = []
    const acceptance_rate: number[] = []

    for (let i = 0; i < periods.length - 1; i++) {
      const start = periods[i]
      const end = periods[i + 1]

      labels.push(new Intl.DateTimeFormat('da-DK', { month: 'short', day: 'numeric' }).format(start))

      const { data } = await supabase
        .from('calculation_feedback')
        .select('hours_variance_percentage, material_variance_percentage, offer_accepted')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())

      if (!data || data.length === 0) {
        hours_accuracy.push(0)
        material_accuracy.push(0)
        acceptance_rate.push(0)
        continue
      }

      const hoursData = data.filter((d) => d.hours_variance_percentage !== null)
      const materialData = data.filter((d) => d.material_variance_percentage !== null)
      const acceptanceData = data.filter((d) => d.offer_accepted !== null)

      hours_accuracy.push(
        hoursData.length > 0
          ? 100 - Math.abs(hoursData.reduce((s, d) => s + (d.hours_variance_percentage || 0), 0) / hoursData.length)
          : 0
      )

      material_accuracy.push(
        materialData.length > 0
          ? 100 -
              Math.abs(
                materialData.reduce((s, d) => s + (d.material_variance_percentage || 0), 0) /
                  materialData.length
              )
          : 0
      )

      acceptance_rate.push(
        acceptanceData.length > 0
          ? (acceptanceData.filter((d) => d.offer_accepted).length / acceptanceData.length) * 100
          : 0
      )
    }

    return {
      success: true,
      data: { labels, hours_accuracy, material_accuracy, acceptance_rate },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente trends') }
  }
}
