'use server'

/**
 * Auto Project Server Actions
 *
 * Server-side actions for the AI project analysis engine.
 * Handles database storage and retrieval of analyses.
 */

import { createClient } from '@/lib/supabase/server'
import { analyzeProject, quickAnalyze } from '@/lib/ai/autoProjectEngine'
import type { ActionResult } from '@/types/common.types'
import type {
  ProjectInterpretation,
  AutoCalculation,
  AutoOfferText,
  RiskFactor,
  AnalyzeProjectOutput,
  OfferTextTemplate,
  CalculationFeedback,
} from '@/types/auto-project.types'
import { requireAuth, formatError } from '@/lib/actions/action-helpers'

// =====================================================
// Types
// =====================================================

interface AnalyzeProjectInput {
  description: string
  customer_id?: string
  options?: {
    hourly_rate?: number
    margin_percentage?: number
    risk_buffer_percentage?: number
    customer_name?: string
    project_address?: string
  }
}

interface QuickAnalysisResult {
  buildingType: string
  sizeM2: number | null
  totalPoints: number
  estimatedHours: number
  estimatedPrice: number
  complexityScore: number
  riskScore: number
}

interface SavedAnalysis {
  id: string
  interpretation: ProjectInterpretation
  calculation: AutoCalculation
  risks: RiskFactor[]
  offer_text: AutoOfferText
  created_at: string
}

// =====================================================
// Helpers
// =====================================================
// =====================================================
// Main Analysis Actions
// =====================================================

/**
 * Analyze a project description and return full results
 */
export async function analyzeProjectDescription(
  input: AnalyzeProjectInput
): Promise<ActionResult<AnalyzeProjectOutput & { id: string; warnings: string[] }>> {
  try {
    const userId = await requireAuth()

    // Run the analysis
    const result = await analyzeProject(
      {
        description: input.description,
        customer_id: input.customer_id,
      },
      input.options
    )

    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Analyse fejlede' }
    }

    const supabase = await createClient()

    // Save interpretation to database
    const { data: savedInterpretation, error: interpError } = await supabase
      .from('project_interpretations')
      .insert({
        raw_description: input.description,
        building_type: result.data.interpretation.building_type,
        building_size_m2: result.data.interpretation.building_size_m2,
        building_age_years: result.data.interpretation.building_age_years,
        rooms: result.data.interpretation.rooms,
        electrical_points: result.data.interpretation.electrical_points,
        cable_requirements: result.data.interpretation.cable_requirements,
        panel_requirements: result.data.interpretation.panel_requirements,
        complexity_score: result.data.interpretation.complexity_score,
        complexity_factors: result.data.interpretation.complexity_factors,
        risk_score: result.data.interpretation.risk_score,
        risk_factors: result.data.interpretation.risk_factors,
        ai_model: result.data.interpretation.ai_model,
        ai_confidence: result.data.interpretation.ai_confidence,
        interpretation_time_ms: result.data.interpretation.interpretation_time_ms,
        created_by: userId,
      })
      .select('id')
      .single()

    if (interpError) {
      console.error('Failed to save interpretation:', interpError)
      // Continue anyway, just won't be persisted
    }

    const interpretationId = savedInterpretation?.id || result.data.interpretation.id

    // Save calculation
    const { data: savedCalc, error: calcError } = await supabase
      .from('auto_calculations')
      .insert({
        interpretation_id: interpretationId,
        components: result.data.calculation.components,
        materials: result.data.calculation.materials,
        base_hours: result.data.calculation.time.base_hours,
        complexity_multiplier: result.data.calculation.time.complexity_multiplier,
        size_multiplier: result.data.calculation.time.size_multiplier,
        accessibility_multiplier: result.data.calculation.time.accessibility_multiplier,
        total_hours: result.data.calculation.time.total_hours,
        material_cost: result.data.calculation.price.material_cost,
        labor_cost: result.data.calculation.price.labor_cost,
        margin_percentage: result.data.calculation.price.margin_percentage,
        risk_buffer_percentage: result.data.calculation.price.risk_buffer_percentage,
        subtotal: result.data.calculation.price.subtotal,
        total_price: result.data.calculation.price.total_price,
        hourly_rate: result.data.calculation.price.hourly_rate,
        calculation_version: result.data.calculation.calculation_version,
      })
      .select('id')
      .single()

    if (calcError) {
      console.error('Failed to save calculation:', calcError)
    }

    const calculationId = savedCalc?.id || result.data.calculation.id

    // Save risks
    if (result.data.risks.length > 0 && savedInterpretation?.id) {
      const risksToInsert = result.data.risks.map((risk) => ({
        interpretation_id: interpretationId,
        risk_type: risk.type,
        severity: risk.severity,
        title: risk.title,
        description: risk.description,
        recommendation: risk.recommendation,
        offer_text: risk.offer_text,
      }))

      const { error: riskError } = await supabase.from('project_risks').insert(risksToInsert)

      if (riskError) {
        console.error('Failed to save risks:', riskError)
      }
    }

    // Save offer text
    if (savedCalc?.id) {
      const { error: offerError } = await supabase.from('auto_offer_texts').insert({
        calculation_id: calculationId,
        work_description: result.data.offer_text.sections.work_description,
        scope_description: result.data.offer_text.sections.scope_description,
        materials_description: result.data.offer_text.sections.materials_description,
        timeline_description: result.data.offer_text.sections.timeline_description,
        reservations: result.data.offer_text.sections.reservations,
        terms: result.data.offer_text.sections.terms,
        full_offer_text: result.data.offer_text.full_offer_text,
      })

      if (offerError) {
        console.error('Failed to save offer text:', offerError)
      }
    }

    // Update IDs in result
    result.data.interpretation.id = interpretationId
    result.data.calculation.id = calculationId

    return {
      success: true,
      data: {
        ...result.data,
        id: interpretationId,
        warnings: result.warnings,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke analysere projekt') }
  }
}

/**
 * Quick analysis without saving - for real-time preview
 */
export async function quickAnalyzeProject(
  description: string
): Promise<ActionResult<QuickAnalysisResult>> {
  try {
    await requireAuth()

    const result = await quickAnalyze(description)

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Hurtig analyse fejlede') }
  }
}

// =====================================================
// Retrieval Actions
// =====================================================

/**
 * Get a saved analysis by ID
 */
export async function getAnalysis(id: string): Promise<ActionResult<SavedAnalysis>> {
  try {
    await requireAuth()

    const supabase = await createClient()

    // Get interpretation
    const { data: interpretation, error: interpError } = await supabase
      .from('project_interpretations')
      .select('*')
      .eq('id', id)
      .single()

    if (interpError || !interpretation) {
      return { success: false, error: 'Analyse ikke fundet' }
    }

    // Get calculation
    const { data: calculation } = await supabase
      .from('auto_calculations')
      .select('*')
      .eq('interpretation_id', id)
      .single()

    // Get risks
    const { data: risks } = await supabase
      .from('project_risks')
      .select('*')
      .eq('interpretation_id', id)

    // Get offer text
    const { data: offerText } = await supabase
      .from('auto_offer_texts')
      .select('*')
      .eq('calculation_id', calculation?.id)
      .single()

    return {
      success: true,
      data: {
        id,
        interpretation: {
          id: interpretation.id,
          raw_description: interpretation.raw_description,
          building_type: interpretation.building_type,
          building_size_m2: interpretation.building_size_m2,
          building_age_years: interpretation.building_age_years,
          rooms: interpretation.rooms || [],
          electrical_points: interpretation.electrical_points || {},
          cable_requirements: interpretation.cable_requirements || {},
          panel_requirements: interpretation.panel_requirements || {},
          complexity_score: interpretation.complexity_score,
          complexity_factors: interpretation.complexity_factors || [],
          risk_score: interpretation.risk_score,
          risk_factors: interpretation.risk_factors || [],
          ai_model: interpretation.ai_model,
          ai_confidence: interpretation.ai_confidence,
          interpretation_time_ms: interpretation.interpretation_time_ms,
          created_at: interpretation.created_at,
        },
        calculation: calculation
          ? {
              id: calculation.id,
              interpretation_id: calculation.interpretation_id,
              components: calculation.components || [],
              materials: calculation.materials || [],
              time: {
                base_hours: calculation.base_hours,
                complexity_multiplier: calculation.complexity_multiplier,
                size_multiplier: calculation.size_multiplier,
                accessibility_multiplier: calculation.accessibility_multiplier,
                total_hours: calculation.total_hours,
                breakdown: [],
              },
              price: {
                material_cost: calculation.material_cost,
                labor_cost: calculation.labor_cost,
                subtotal: calculation.subtotal,
                margin_percentage: calculation.margin_percentage,
                margin_amount: calculation.subtotal * (calculation.margin_percentage / 100),
                risk_buffer_percentage: calculation.risk_buffer_percentage,
                risk_buffer_amount:
                  calculation.subtotal * (calculation.risk_buffer_percentage / 100),
                total_price: calculation.total_price,
                hourly_rate: calculation.hourly_rate,
              },
              calculation_version: calculation.calculation_version,
              calculated_at: calculation.calculated_at,
            }
          : {
              id: '',
              interpretation_id: id,
              components: [],
              materials: [],
              time: {
                base_hours: 0,
                complexity_multiplier: 1,
                size_multiplier: 1,
                accessibility_multiplier: 1,
                total_hours: 0,
                breakdown: [],
              },
              price: {
                material_cost: 0,
                labor_cost: 0,
                subtotal: 0,
                margin_percentage: 25,
                margin_amount: 0,
                risk_buffer_percentage: 5,
                risk_buffer_amount: 0,
                total_price: 0,
                hourly_rate: 450,
              },
              calculation_version: 'v2.0',
              calculated_at: new Date().toISOString(),
            },
        risks: (risks || []).map((r) => ({
          type: r.risk_type,
          code: r.id,
          title: r.title,
          description: r.description,
          severity: r.severity,
          recommendation: r.recommendation,
          offer_text: r.offer_text,
        })),
        offer_text: offerText
          ? {
              id: offerText.id,
              calculation_id: offerText.calculation_id,
              sections: {
                work_description: offerText.work_description,
                scope_description: offerText.scope_description,
                materials_description: offerText.materials_description,
                timeline_description: offerText.timeline_description,
                reservations: offerText.reservations,
                terms: offerText.terms,
              },
              full_offer_text: offerText.full_offer_text,
              generated_at: offerText.generated_at,
              is_edited: offerText.is_edited,
            }
          : {
              id: '',
              calculation_id: '',
              sections: {
                work_description: '',
                scope_description: '',
                materials_description: '',
                timeline_description: '',
                reservations: '',
                terms: '',
              },
              full_offer_text: '',
              generated_at: new Date().toISOString(),
              is_edited: false,
            },
        created_at: interpretation.created_at,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente analyse') }
  }
}

/**
 * List recent analyses
 */
export async function listAnalyses(
  options?: { limit?: number }
): Promise<ActionResult<{ id: string; description: string; total_price: number; created_at: string }[]>> {
  try {
    const userId = await requireAuth()

    const supabase = await createClient()
    const limit = options?.limit || 20

    const { data, error } = await supabase
      .from('project_interpretations')
      .select(
        `
        id,
        raw_description,
        created_at,
        auto_calculations(total_price)
      `
      )
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return { success: false, error: 'Kunne ikke hente analyser' }
    }

    const result = (data || []).map((item: any) => ({
      id: item.id,
      description: item.raw_description?.substring(0, 100) + '...',
      total_price: item.auto_calculations?.[0]?.total_price || 0,
      created_at: item.created_at,
    }))

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente analyser') }
  }
}

// =====================================================
// Offer Template Actions
// =====================================================

/**
 * Get available offer templates
 */
export async function getOfferTemplates(): Promise<ActionResult<OfferTextTemplate[]>> {
  try {
    await requireAuth()

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('offer_text_templates')
      .select('*')
      .eq('is_active', true)
      .order('is_default', { ascending: false })

    if (error) {
      return { success: false, error: 'Kunne ikke hente skabeloner' }
    }

    return {
      success: true,
      data: (data || []).map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        work_description_template: t.work_description_template,
        scope_template: t.scope_template,
        materials_template: t.materials_template,
        timeline_template: t.timeline_template,
        reservations_template: t.reservations_template,
        terms_template: t.terms_template,
        available_placeholders: t.available_placeholders || [],
        is_default: t.is_default,
        is_active: t.is_active,
      })),
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente skabeloner') }
  }
}

// =====================================================
// Feedback Actions
// =====================================================

/**
 * Record feedback for a calculation (for self-improvement)
 */
export async function recordCalculationFeedback(
  calculationId: string | null,
  feedback: Partial<CalculationFeedback>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAuth()

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('calculation_feedback')
      .insert({
        calculation_id: calculationId || null,
        offer_id: feedback.offer_id,
        project_id: feedback.project_id,
        estimated_hours: feedback.estimated_hours,
        actual_hours: feedback.actual_hours,
        hours_variance_percentage: feedback.hours_variance_percentage,
        estimated_material_cost: feedback.estimated_material_cost,
        actual_material_cost: feedback.actual_material_cost,
        material_variance_percentage: feedback.material_variance_percentage,
        offer_accepted: feedback.offer_accepted,
        project_profitable: feedback.project_profitable,
        customer_satisfaction: feedback.customer_satisfaction,
        lessons_learned: feedback.lessons_learned,
        adjustment_suggestions: feedback.adjustment_suggestions || [],
      })
      .select('id')
      .single()

    if (error) {
      return { success: false, error: 'Kunne ikke gemme feedback' }
    }

    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gemme feedback') }
  }
}

// =====================================================
// Create Offer from Analysis
// =====================================================

/**
 * Create a real offer from an analysis
 */
export async function createOfferFromAnalysis(
  analysisId: string,
  customerId: string
): Promise<ActionResult<{ offer_id: string }>> {
  try {
    await requireAuth()

    // Get the analysis
    const analysisResult = await getAnalysis(analysisId)
    if (!analysisResult.success || !analysisResult.data) {
      return { success: false, error: 'Analyse ikke fundet' }
    }

    const { calculation, offer_text } = analysisResult.data
    const supabase = await createClient()

    // Create offer
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .insert({
        customer_id: customerId,
        status: 'draft',
        description: offer_text.sections.work_description,
        total_amount: calculation.price.total_price,
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        notes: offer_text.full_offer_text,
      })
      .select('id')
      .single()

    if (offerError || !offer) {
      return { success: false, error: 'Kunne ikke oprette tilbud' }
    }

    // Create offer line items
    const lineItems = calculation.components.map((comp, idx) => ({
      offer_id: offer.id,
      position: idx + 1,
      description: comp.name,
      quantity: comp.quantity,
      unit: comp.unit,
      unit_price: comp.unit_price,
      total_price: comp.total,
    }))

    if (lineItems.length > 0) {
      await supabase.from('offer_line_items').insert(lineItems)
    }

    // Record in feedback that this was converted to offer
    await supabase.from('calculation_feedback').insert({
      calculation_id: calculation.id,
      offer_id: offer.id,
      estimated_hours: calculation.time.total_hours,
      estimated_material_cost: calculation.price.material_cost,
    })

    return { success: true, data: { offer_id: offer.id } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette tilbud') }
  }
}
