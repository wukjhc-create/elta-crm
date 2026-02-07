/**
 * Auto Project Engine
 *
 * Master orchestrator that combines all AI modules:
 * 1. Project Interpreter - Extract structured data from text
 * 2. Component Matcher - Map to calculation components/materials
 * 3. Calculation Engine - Calculate time and price
 * 4. Risk Engine - Detect and analyze risks
 * 5. Offer Generator - Generate professional offer text
 *
 * This is the main entry point for the auto-project feature.
 */

import { interpretProject } from './projectInterpreter'
import {
  matchComponents,
  toCalculationComponents,
  toCalculationMaterials,
} from './componentMatcher'
import { calculateProject, adjustPriceForRisk } from './calculationEngine'
import { analyzeRisks } from './riskEngine'
import { generateOfferText } from './offerGenerator'

import type {
  ProjectInterpretation,
  AutoCalculation,
  AutoOfferText,
  AnalyzeProjectInput,
  AnalyzeProjectOutput,
  ProjectAnalysisProgress,
} from '@/types/auto-project.types'
import type { RiskAnalysis } from './riskEngine'

// =====================================================
// Types
// =====================================================

export interface AnalysisResult {
  success: boolean
  data?: AnalyzeProjectOutput
  error?: string
  warnings: string[]
  processingTime: number
}

export interface EngineOptions {
  hourly_rate?: number
  margin_percentage?: number
  risk_buffer_percentage?: number
  customer_name?: string
  project_address?: string
  onProgress?: (progress: ProjectAnalysisProgress) => void
}

// =====================================================
// Progress Reporting
// =====================================================

function reportProgress(
  callback: EngineOptions['onProgress'],
  stage: ProjectAnalysisProgress['stage'],
  progress: number,
  message: string
): void {
  if (callback) {
    callback({ stage, progress, message })
  }
}

// =====================================================
// Main Engine
// =====================================================

export async function analyzeProject(
  input: AnalyzeProjectInput,
  options?: EngineOptions
): Promise<AnalysisResult> {
  const startTime = Date.now()
  const warnings: string[] = []
  const onProgress = options?.onProgress

  try {
    // Stage 1: Interpret project description
    reportProgress(onProgress, 'interpreting', 10, 'Analyserer projektbeskrivelse...')

    const { interpretation, confidence, warnings: interpretWarnings } = await interpretProject(
      input.description
    )
    warnings.push(...interpretWarnings)

    if (confidence < 0.4) {
      warnings.push('Lav fortolkningssikkerhed. Resultatet kan være upræcist.')
    }

    // Create interpretation object with ID placeholder
    const interpretationWithId: ProjectInterpretation = {
      ...interpretation,
      id: `temp-${Date.now()}`,
      created_at: new Date().toISOString(),
    }

    // Stage 2: Match to components and materials
    reportProgress(onProgress, 'matching', 30, 'Finder komponenter og materialer...')

    const matchResult = await matchComponents(interpretationWithId)
    const components = toCalculationComponents(matchResult.components)
    const materials = toCalculationMaterials(matchResult.materials)

    if (matchResult.matchConfidence < 0.5) {
      warnings.push('Mange komponenter blev estimeret. Tjek priser manuelt.')
    }

    // Stage 3: Calculate time and price
    reportProgress(onProgress, 'calculating', 50, 'Beregner tid og pris...')

    const calculationData = calculateProject(
      interpretationWithId.id,
      components,
      materials,
      interpretationWithId,
      {
        hourly_rate: options?.hourly_rate,
        margin_percentage: options?.margin_percentage,
        risk_buffer_percentage: options?.risk_buffer_percentage,
      }
    )

    // Create calculation object with ID
    const calculation: AutoCalculation = {
      ...calculationData,
      id: `calc-${Date.now()}`,
      calculated_at: new Date().toISOString(),
    }

    // Stage 4: Analyze risks
    reportProgress(onProgress, 'analyzing_risks', 70, 'Analyserer risici...')

    const riskAnalysis: RiskAnalysis = analyzeRisks(interpretationWithId, calculation.price)

    // Adjust price for high risk
    if (riskAnalysis.overall_score >= 4) {
      calculation.price = adjustPriceForRisk(calculation.price, riskAnalysis.overall_score)
      warnings.push('Pris justeret opad pga. forhøjet risikoniveau.')
    }

    // Stage 5: Generate offer text
    reportProgress(onProgress, 'generating_text', 85, 'Genererer tilbudstekst...')

    const offerTextData = generateOfferText(
      interpretationWithId,
      calculation,
      riskAnalysis,
      {
        customerName: options?.customer_name,
        projectAddress: options?.project_address,
      }
    )

    // Create offer text object with ID
    const offerText: AutoOfferText = {
      ...offerTextData,
      id: `offer-${Date.now()}`,
      generated_at: new Date().toISOString(),
    }

    // Stage 6: Complete
    reportProgress(onProgress, 'complete', 100, 'Analyse fuldført!')

    const processingTime = Date.now() - startTime

    return {
      success: true,
      data: {
        interpretation: interpretationWithId,
        calculation,
        risks: riskAnalysis.risks,
        offer_text: offerText,
      },
      warnings,
      processingTime,
    }
  } catch (error) {
    const processingTime = Date.now() - startTime

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Ukendt fejl under analyse',
      warnings,
      processingTime,
    }
  }
}

// =====================================================
// Quick Analysis (without offer generation)
// =====================================================

export async function quickAnalyze(description: string): Promise<{
  buildingType: string
  sizeM2: number | null
  totalPoints: number
  estimatedHours: number
  estimatedPrice: number
  complexityScore: number
  riskScore: number
}> {
  const { interpretation } = await interpretProject(description)

  const interpretationWithId: ProjectInterpretation = {
    ...interpretation,
    id: 'quick',
    created_at: new Date().toISOString(),
  }

  const matchResult = await matchComponents(interpretationWithId)
  const components = toCalculationComponents(matchResult.components)
  const materials = toCalculationMaterials(matchResult.materials)

  const calc = calculateProject('quick', components, materials, interpretationWithId)

  const totalPoints = Object.values(interpretation.electrical_points).reduce(
    (sum, v) => sum + (v || 0),
    0
  )

  return {
    buildingType: interpretation.building_type,
    sizeM2: interpretation.building_size_m2,
    totalPoints,
    estimatedHours: calc.time.total_hours,
    estimatedPrice: calc.price.total_price,
    complexityScore: interpretation.complexity_score,
    riskScore: interpretation.risk_score,
  }
}

// =====================================================
// Re-export types and modules
// =====================================================

export { interpretProject } from './projectInterpreter'
export { matchComponents, toCalculationComponents, toCalculationMaterials } from './componentMatcher'
export { calculateProject, calculateTime, calculatePrice, formatCurrency, formatHours } from './calculationEngine'
export { analyzeRisks, generateOfferReservations, generateInternalNotes } from './riskEngine'
export { generateOfferText } from './offerGenerator'

export type { RiskAnalysis } from './riskEngine'
export type { InterpretationResult } from './projectInterpreter'
export type { MatchingResult } from './componentMatcher'
