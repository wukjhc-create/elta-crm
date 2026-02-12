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
import { validateUUID } from '@/lib/validations/common'
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
    validateUUID(data.calculation_id, 'calculation_id')
    if (data.offer_id) validateUUID(data.offer_id, 'offer_id')
    if (data.project_id) validateUUID(data.project_id, 'project_id')

    // Get estimated values from calculation
    const { data: calc } = await supabase
      .from('auto_calculations')
      .select('total_hours, material_cost')
      .eq('id', data.calculation_id)
      .maybeSingle()

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
// Auto-Feedback Pipeline
// =====================================================

/**
 * Automatically collect feedback from completed projects.
 * Connects: project.actual_hours (from time_entries) → calculation_feedback
 *
 * This should be called periodically (e.g., daily via cron or admin dashboard)
 * to keep the learning engine fed with real data.
 */
export async function collectProjectFeedback(): Promise<
  ActionResult<{ processed: number; created: number; skipped: number }>
> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (profile?.role !== 'admin') {
      return { success: false, error: 'Kun administratorer kan køre feedback-indsamling' }
    }

    // Find completed projects with actual_hours that don't have feedback yet
    // Chain: project → offer → auto_calculations → calculation_feedback
    const { data: projects } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        actual_hours,
        status,
        offer_id,
        offers!inner (
          id,
          total_amount,
          status
        )
      `)
      .eq('status', 'completed')
      .gt('actual_hours', 0)
      .limit(100)

    if (!projects || projects.length === 0) {
      return { success: true, data: { processed: 0, created: 0, skipped: 0 } }
    }

    let created = 0
    let skipped = 0

    for (const project of projects) {
      const offer = Array.isArray(project.offers) ? project.offers[0] : project.offers
      if (!offer) {
        skipped++
        continue
      }

      // Find related auto_calculation via offer
      const { data: calc } = await supabase
        .from('auto_calculations')
        .select('id, total_hours, material_cost')
        .eq('offer_id', offer.id)
        .maybeSingle()

      if (!calc) {
        // Try linking via project interpretation
        skipped++
        continue
      }

      // Check if feedback already exists
      const { data: existingFeedback } = await supabase
        .from('calculation_feedback')
        .select('id')
        .eq('calculation_id', calc.id)
        .maybeSingle()

      if (existingFeedback) {
        skipped++
        continue
      }

      // Calculate variances
      const estimated_hours = calc.total_hours || 0
      const actual_hours = project.actual_hours || 0
      const hours_variance = estimated_hours > 0
        ? ((actual_hours - estimated_hours) / estimated_hours) * 100
        : null

      // Create feedback record
      const { error } = await supabase
        .from('calculation_feedback')
        .insert({
          calculation_id: calc.id,
          offer_id: offer.id,
          project_id: project.id,
          estimated_hours,
          actual_hours,
          hours_variance_percentage: hours_variance !== null
            ? Math.round(hours_variance * 10) / 10
            : null,
          estimated_material_cost: calc.material_cost,
          offer_accepted: offer.status === 'accepted',
          project_profitable: actual_hours <= estimated_hours * 1.1, // Within 10% is profitable
          lessons_learned: `Auto-indsamlet fra projekt "${project.name}"`,
        })

      if (!error) {
        created++
      } else {
        skipped++
      }
    }

    revalidatePath('/dashboard')
    return {
      success: true,
      data: { processed: projects.length, created, skipped },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke indsamle feedback') }
  }
}

/**
 * Run auto-calibration and apply high-confidence adjustments to the database.
 * This is the "close the loop" function that makes the system self-improving.
 *
 * - Analyzes component calibrations from the learning engine
 * - Applies adjustments where confidence ≥ 0.8 and variance > 15%
 * - Records all changes in calculation_feedback as audit trail
 * - Updates kalkia_nodes base_time_seconds for matching components
 */
export async function runAutoCalibrationAndApply(): Promise<
  ActionResult<{ analyzed: number; applied: number; adjustments: Adjustment[] }>
> {
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

    // Get calibration suggestions
    const calibrations = await analyzeComponentCalibration()
    const appliedAdjustments: Adjustment[] = []

    for (const cal of calibrations) {
      // Only apply if confidence is high and variance is significant
      if (cal.confidence < 0.8 || Math.abs(cal.variance_percentage) <= 15) {
        continue
      }

      // Update calc_components time_estimate
      const { error: compError } = await supabase
        .from('calc_components')
        .update({
          time_estimate: cal.suggested_time_minutes,
          updated_at: new Date().toISOString(),
        })
        .eq('code', cal.code)

      if (compError) continue

      // Also update kalkia_nodes base_time_seconds if matching node exists
      const suggestedSeconds = Math.round(cal.suggested_time_minutes * 60)
      await supabase
        .from('kalkia_nodes')
        .update({
          base_time_seconds: suggestedSeconds,
          updated_at: new Date().toISOString(),
        })
        .eq('code', cal.code)

      const adjustment: Adjustment = {
        type: 'time',
        component: cal.code,
        old_value: cal.current_time_minutes,
        new_value: cal.suggested_time_minutes,
        reason: `Auto-kalibrering: ${cal.sample_size} projekter viste ${cal.variance_percentage > 0 ? 'underestimering' : 'overestimering'} på ${Math.abs(cal.variance_percentage).toFixed(1)}% (konfidens: ${(cal.confidence * 100).toFixed(0)}%)`,
        applied_at: new Date().toISOString(),
      }

      appliedAdjustments.push(adjustment)

      // Record in feedback as audit trail
      await supabase
        .from('calculation_feedback')
        .insert({
          lessons_learned: `Auto-kalibrering: ${cal.code} justeret fra ${cal.current_time_minutes}min til ${cal.suggested_time_minutes}min`,
          adjustment_suggestions: [{ ...adjustment, applied_by: userId }],
        })
    }

    revalidatePath('/dashboard/settings')
    return {
      success: true,
      data: {
        analyzed: calibrations.length,
        applied: appliedAdjustments.length,
        adjustments: appliedAdjustments,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke køre autokalibrering') }
  }
}

/**
 * Get learning system status overview.
 * Shows data pipeline health and calibration readiness.
 */
export async function getLearningSystemStatus(): Promise<
  ActionResult<{
    feedback_count: number
    projects_with_actuals: number
    projects_without_feedback: number
    calibrations_ready: number
    calibrations_pending: number
    last_calibration_at: string | null
    pipeline_healthy: boolean
  }>
> {
  try {
    const { supabase } = await getAuthenticatedClient()

    // Count feedback records
    const { count: feedbackCount } = await supabase
      .from('calculation_feedback')
      .select('*', { count: 'exact', head: true })

    // Count completed projects with actual hours
    const { count: projectsWithActuals } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gt('actual_hours', 0)

    // Count projects with feedback (via calculation_feedback.project_id)
    const { count: projectsWithFeedback } = await supabase
      .from('calculation_feedback')
      .select('*', { count: 'exact', head: true })
      .not('project_id', 'is', null)

    // Get calibration readiness
    const calibrations = await analyzeComponentCalibration()
    const ready = calibrations.filter(c => c.confidence >= 0.8 && Math.abs(c.variance_percentage) > 15)
    const pending = calibrations.filter(c => c.confidence < 0.8)

    // Last calibration
    const { data: lastAdj } = await supabase
      .from('calculation_feedback')
      .select('created_at')
      .not('adjustment_suggestions', 'eq', '[]')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const feedbackTotal = feedbackCount ?? 0
    const projectTotal = projectsWithActuals ?? 0
    const noFeedbackCount = projectTotal - (projectsWithFeedback ?? 0)

    return {
      success: true,
      data: {
        feedback_count: feedbackTotal,
        projects_with_actuals: projectTotal,
        projects_without_feedback: Math.max(0, noFeedbackCount),
        calibrations_ready: ready.length,
        calibrations_pending: pending.length,
        last_calibration_at: lastAdj?.created_at ?? null,
        pipeline_healthy: feedbackTotal > 0 || projectTotal === 0,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente systemstatus') }
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
        .limit(500)

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
