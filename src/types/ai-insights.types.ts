export type AiSuggestionType =
  | 'pricing'
  | 'margin_alert'
  | 'offer_suggestion'
  | 'employee_insight'
  | 'forecast'
  | 'dashboard_insight'

export type CustomerType = 'private' | 'business'

export interface PricingInput {
  jobType: string
  materialCost: number
  laborHours: number
  customerType?: CustomerType
}

export interface PricingSuggestion {
  recommendedPrice: number
  recommendedMargin: number     // percentage
  confidenceScore: number       // 0–1
  reasoning: string
  basedOnJobs: number
  laborRateUsed: number
}

export interface OfferImprovement {
  type: 'price_low' | 'add_material' | 'upsell'
  description: string
  payload?: Record<string, unknown>
}

export interface EmployeePerformance {
  employeeId: string
  jobCount: number
  avgHoursPerJob: number
  avgProfitPerJob: number
  efficiencyScore: number       // 0–1, profit/hour normalised against peer median
}

export interface RevenueForecast {
  horizonDays: number
  expectedRevenue: number
  pipelineValue: number
  conversionRate: number        // 0–1
  recentlyAccepted: number
  asOf: string
}

export interface DashboardInsight {
  id: string
  type: AiSuggestionType
  message: string
  detail?: string
  severity: 'info' | 'warning' | 'critical'
  payload?: Record<string, unknown>
}

export interface AiSuggestionRow {
  id: string
  type: AiSuggestionType
  entity_type: string | null
  entity_id: string | null
  confidence: number | null
  message: string
  payload: Record<string, unknown> | null
  acted_on: boolean
  acted_at: string | null
  created_at: string
}
