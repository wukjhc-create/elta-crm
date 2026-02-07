/**
 * AI Modules Index
 *
 * Central export for all AI-powered features in the ELTA CRM system.
 */

// Main orchestrator
export {
  analyzeProject,
  quickAnalyze,
  type AnalysisResult,
  type EngineOptions,
} from './autoProjectEngine'

// Individual modules
export { interpretProject, type InterpretationResult } from './projectInterpreter'

export {
  matchComponents,
  toCalculationComponents,
  toCalculationMaterials,
  type MatchingResult,
} from './componentMatcher'

export {
  calculateProject,
  calculateTime,
  calculatePrice,
  formatCurrency,
  formatHours,
  estimateWorkdays,
  adjustPriceForRisk,
  applyDiscount,
} from './calculationEngine'

export {
  analyzeRisks,
  generateOfferReservations,
  generateInternalNotes,
  type RiskAnalysis,
} from './riskEngine'

export { generateOfferText, formatOfferSectionForDisplay } from './offerGenerator'
