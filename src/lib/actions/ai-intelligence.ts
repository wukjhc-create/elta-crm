'use server'

/**
 * AI INTELLIGENCE SERVER ACTIONS
 *
 * Server actions for Phase D AI-assisted features:
 * - Project intake parsing
 * - Risk analysis
 * - Offer text generation
 * - Price explanations
 */

import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { revalidatePath } from 'next/cache'
import { parseProjectDescription, getKeywordCategories } from '@/lib/engines/project-intake'
import { analyzeProjectRisks, quickRiskCheck, getOfferObsPoints, getRecommendedMargin } from '@/lib/engines/risk-engine'
import { assembleOfferTexts, generateOfferContent } from '@/lib/engines/offer-text-engine'
import { generatePriceExplanation, generateSimpleSummary, generateBulletSummary } from '@/lib/engines/price-explanation-engine'
import type {
  ProjectIntakeInput,
  ProjectIntakeResult,
  RiskAnalysisInput,
  RiskAnalysisResult,
  PriceExplanationInput,
  PriceExplanationResult,
  ProjectContextCreate,
  RiskAssessmentCreate,
  CalculationSnapshot,
  CalculationSnapshotData,
} from '@/types/ai-intelligence.types'
import type { OfferTextContext } from '@/lib/engines/offer-text-engine'
import type { OfferTextTemplate } from '@/types/component-intelligence.types'

// =====================================================
// PROJECT INTAKE ACTIONS
// =====================================================

/**
 * Parse project description and suggest rooms/components
 */
export async function parseProjectDescriptionAction(
  input: ProjectIntakeInput
): Promise<{ success: true; data: ProjectIntakeResult } | { success: false; error: string }> {
  try {
    const result = parseProjectDescription(input)
    return { success: true, data: result }
  } catch (error) {
    console.error('Error parsing project description:', error)
    return { success: false, error: 'Kunne ikke analysere projektbeskrivelsen' }
  }
}

/**
 * Save parsed project context to database
 */
export async function saveProjectContext(
  context: ProjectContextCreate
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('project_contexts')
      .insert({
        ...context,
        created_by: userId,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error saving project context:', error)
      return { success: false, error: 'Kunne ikke gemme projektkontekst' }
    }

    return { success: true, id: data.id }
  } catch (error) {
    console.error('Error saving project context:', error)
    return { success: false, error: 'Uventet fejl ved gemning af projektkontekst' }
  }
}

/**
 * Get project context for a calculation
 */
export async function getProjectContext(calculationId: string) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('project_contexts')
      .select('*')
      .eq('calculation_id', calculationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching project context:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Error fetching project context:', error)
    return null
  }
}

/**
 * Get available keywords for UI display
 */
export async function getAvailableKeywords() {
  return getKeywordCategories()
}

// =====================================================
// RISK ANALYSIS ACTIONS
// =====================================================

/**
 * Analyze project for risks
 */
export async function analyzeRisksAction(
  input: RiskAnalysisInput
): Promise<{ success: true; data: RiskAnalysisResult } | { success: false; error: string }> {
  try {
    const result = analyzeProjectRisks(input)
    return { success: true, data: result }
  } catch (error) {
    console.error('Error analyzing risks:', error)
    return { success: false, error: 'Kunne ikke analysere risici' }
  }
}

/**
 * Quick risk check for UI indicators
 */
export async function quickRiskCheckAction(input: RiskAnalysisInput) {
  try {
    return quickRiskCheck(input)
  } catch (error) {
    console.error('Error in quick risk check:', error)
    return { level: 'low' as const, count: 0, topIssue: null }
  }
}

/**
 * Get OBS points for offer
 */
export async function getObsPointsAction(input: RiskAnalysisInput) {
  try {
    return getOfferObsPoints(input)
  } catch (error) {
    console.error('Error getting OBS points:', error)
    return []
  }
}

/**
 * Get margin recommendation
 */
export async function getMarginRecommendationAction(input: RiskAnalysisInput) {
  try {
    return getRecommendedMargin(input)
  } catch (error) {
    console.error('Error getting margin recommendation:', error)
    return { minimumMargin: 15, recommendedMargin: 25, reason: 'Standard margin' }
  }
}

/**
 * Save risk assessments to database
 */
export async function saveRiskAssessments(
  calculationId: string,
  risks: RiskAssessmentCreate[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    if (risks.length === 0) {
      return { success: true }
    }

    const { error } = await supabase
      .from('risk_assessments')
      .insert(
        risks.map(risk => ({
          ...risk,
          calculation_id: calculationId,
        }))
      )

    if (error) {
      console.error('Error saving risk assessments:', error)
      return { success: false, error: 'Kunne ikke gemme risikovurderinger' }
    }

    return { success: true }
  } catch (error) {
    console.error('Error saving risk assessments:', error)
    return { success: false, error: 'Uventet fejl ved gemning af risikovurderinger' }
  }
}

/**
 * Get risk assessments for a calculation
 */
export async function getRiskAssessments(calculationId: string) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('risk_assessments')
      .select('*')
      .eq('calculation_id', calculationId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching risk assessments:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error fetching risk assessments:', error)
    return []
  }
}

/**
 * Acknowledge a risk
 */
export async function acknowledgeRisk(
  riskId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('risk_assessments')
      .update({
        is_acknowledged: true,
        acknowledged_by: userId,
        acknowledged_at: new Date().toISOString(),
        resolution_notes: notes,
      })
      .eq('id', riskId)

    if (error) {
      console.error('Error acknowledging risk:', error)
      return { success: false, error: 'Kunne ikke kvittere risiko' }
    }

    return { success: true }
  } catch (error) {
    console.error('Error acknowledging risk:', error)
    return { success: false, error: 'Uventet fejl' }
  }
}

// =====================================================
// OFFER TEXT ACTIONS
// =====================================================

/**
 * Generate offer texts from templates
 */
export async function generateOfferTextsAction(
  context: OfferTextContext
): Promise<{ success: true; data: ReturnType<typeof assembleOfferTexts> } | { success: false; error: string }> {
  try {
    const supabase = await createClient()

    // Fetch all active templates
    const { data: templates, error } = await supabase
      .from('offer_text_templates')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })

    if (error) {
      console.error('Error fetching templates:', error)
      return { success: false, error: 'Kunne ikke hente tekstskabeloner' }
    }

    const result = assembleOfferTexts(templates as OfferTextTemplate[], context)
    return { success: true, data: result }
  } catch (error) {
    console.error('Error generating offer texts:', error)
    return { success: false, error: 'Kunne ikke generere tilbudstekster' }
  }
}

/**
 * Generate and save offer content
 */
export async function generateAndSaveOfferContent(
  offerId: string,
  context: OfferTextContext
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Fetch templates
    const { data: templates, error: templateError } = await supabase
      .from('offer_text_templates')
      .select('*')
      .eq('is_active', true)

    if (templateError) {
      return { success: false, error: 'Kunne ikke hente skabeloner' }
    }

    // Generate content
    const content = generateOfferContent(templates as OfferTextTemplate[], context)

    // Log generation
    const { error: logError } = await supabase
      .from('offer_generation_log')
      .insert({
        offer_id: offerId,
        generation_type: 'full',
        generated_content: content,
        templates_used: templates?.map(t => t.id) || [],
        created_by: userId,
      })

    if (logError) {
      console.error('Error logging generation:', logError)
    }

    return { success: true }
  } catch (error) {
    console.error('Error generating offer content:', error)
    return { success: false, error: 'Uventet fejl ved generering af tilbudsindhold' }
  }
}

// =====================================================
// PRICE EXPLANATION ACTIONS
// =====================================================

/**
 * Generate price explanation
 */
export async function generatePriceExplanationAction(
  input: PriceExplanationInput
): Promise<{ success: true; data: PriceExplanationResult } | { success: false; error: string }> {
  try {
    const result = generatePriceExplanation(input)
    return { success: true, data: result }
  } catch (error) {
    console.error('Error generating price explanation:', error)
    return { success: false, error: 'Kunne ikke generere prisforklaring' }
  }
}

/**
 * Get simple price summary
 */
export async function getSimplePriceSummary(input: PriceExplanationInput): Promise<string> {
  try {
    return generateSimpleSummary(input)
  } catch (error) {
    console.error('Error generating simple summary:', error)
    return ''
  }
}

/**
 * Get bullet point summary
 */
export async function getBulletPriceSummary(input: PriceExplanationInput): Promise<string[]> {
  try {
    return generateBulletSummary(input)
  } catch (error) {
    console.error('Error generating bullet summary:', error)
    return []
  }
}

/**
 * Save price explanation to database
 */
export async function savePriceExplanation(
  calculationId: string | null,
  offerId: string | null,
  result: PriceExplanationResult,
  format: 'simple' | 'detailed' | 'itemized' = 'detailed'
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('price_explanations')
      .insert({
        calculation_id: calculationId,
        offer_id: offerId,
        language: 'da',
        format,
        sections: result.sections,
        breakdown_data: result.breakdown,
        generated_at: new Date().toISOString(),
        created_by: userId,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error saving price explanation:', error)
      return { success: false, error: 'Kunne ikke gemme prisforklaring' }
    }

    return { success: true, id: data.id }
  } catch (error) {
    console.error('Error saving price explanation:', error)
    return { success: false, error: 'Uventet fejl' }
  }
}

/**
 * Get price explanation for offer
 */
export async function getPriceExplanation(offerId: string) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('price_explanations')
      .select('*')
      .eq('offer_id', offerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching price explanation:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Error fetching price explanation:', error)
    return null
  }
}

// =====================================================
// CALCULATION SNAPSHOT ACTIONS
// =====================================================

/**
 * Create calculation snapshot
 */
export async function createCalculationSnapshot(
  calculationId: string | null,
  offerId: string | null,
  data: CalculationSnapshotData,
  reason?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Get version number
    let version = 1
    if (calculationId) {
      const { count } = await supabase
        .from('calculation_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('calculation_id', calculationId)

      version = (count || 0) + 1
    }

    // Determine risk level from margin
    let riskLevel: 'low' | 'medium' | 'high' | null = null
    if (data.totals.margin_percentage < 10) {
      riskLevel = 'high'
    } else if (data.totals.margin_percentage < 20) {
      riskLevel = 'medium'
    } else {
      riskLevel = 'low'
    }

    // Calculate effective hourly rate
    const effectiveRate = data.totals.total_time_minutes > 0
      ? (data.totals.total_labor_cost / (data.totals.total_time_minutes / 60))
      : null

    const { data: snapshot, error } = await supabase
      .from('calculation_snapshots')
      .insert({
        calculation_id: calculationId,
        offer_id: offerId,
        version,
        snapshot_reason: reason,
        calculation_data: data,
        total_time_minutes: data.totals.total_time_minutes,
        total_labor_cost: data.totals.total_labor_cost,
        total_material_cost: data.totals.total_material_cost,
        total_price: data.totals.total_price,
        margin_percentage: data.totals.margin_percentage,
        effective_hourly_rate: effectiveRate,
        component_count: data.items.length,
        risk_level: riskLevel,
        created_by: userId,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error creating snapshot:', error)
      return { success: false, error: 'Kunne ikke oprette snapshot' }
    }

    return { success: true, id: snapshot.id }
  } catch (error) {
    console.error('Error creating snapshot:', error)
    return { success: false, error: 'Uventet fejl' }
  }
}

/**
 * Get snapshots for a calculation
 */
export async function getCalculationSnapshots(calculationId: string) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('calculation_snapshots')
      .select('*')
      .eq('calculation_id', calculationId)
      .order('version', { ascending: false })

    if (error) {
      console.error('Error fetching snapshots:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error fetching snapshots:', error)
    return []
  }
}
