/**
 * PHASE D: AI-ASSISTED PROJECT & OFFER INTELLIGENCE
 *
 * Type definitions for:
 * - Project context parsing and intake
 * - Risk assessment and detection
 * - Price explanations
 * - Calculation snapshots
 * - AI prompt templates (future integration)
 */

// =====================================================
// ENUMS AND CONSTANTS
// =====================================================

export const PROJECT_TYPES = ['renovation', 'new_build', 'extension', 'maintenance'] as const
export type ProjectType = (typeof PROJECT_TYPES)[number]

export const BUILDING_TYPES = ['house', 'apartment', 'commercial', 'industrial'] as const
export type BuildingType = (typeof BUILDING_TYPES)[number]

export const URGENCY_LEVELS = ['low', 'normal', 'high', 'emergency'] as const
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number]

export const CUSTOMER_PRIORITIES = ['price', 'quality', 'speed', 'warranty'] as const
export type CustomerPriority = (typeof CUSTOMER_PRIORITIES)[number]

export const RISK_CATEGORIES = [
  'technical',
  'time',
  'legal',
  'safety',
  'margin',
  'scope',
  'access',
  'material',
] as const
export type RiskCategory = (typeof RISK_CATEGORIES)[number]

export const RISK_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const
export type RiskSeverity = (typeof RISK_SEVERITIES)[number]

export const SOURCE_TYPES = ['manual', 'text_input', 'ai_parsed'] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

// =====================================================
// PROJECT CONTEXT
// =====================================================

export interface DetectedRoom {
  room_type: string
  count: number
  size_m2?: number
  confidence: number
  source?: string // keyword that triggered detection
}

export interface DetectedComponent {
  component_code: string
  quantity: number
  reason: string
  confidence: number
}

export interface DetectedQuickJob {
  job_code: string
  reason: string
  confidence: number
}

export interface ProjectContext {
  id: string
  calculation_id: string | null
  source_type: SourceType
  original_text: string | null

  // Parsed project info
  project_type: ProjectType | null
  building_type: BuildingType | null
  building_age_years: number | null
  building_size_m2: number | null

  // Detected elements
  detected_rooms: DetectedRoom[]
  detected_components: DetectedComponent[]
  detected_quick_jobs: DetectedQuickJob[]

  // Customer context
  customer_priority: CustomerPriority | null
  urgency_level: UrgencyLevel

  // Special conditions
  access_restrictions: string | null
  working_hours_constraints: string | null
  special_requirements: string[]

  // Confidence
  overall_confidence: number
  parsing_notes: string | null

  // Audit
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProjectContextCreate {
  calculation_id?: string
  source_type?: SourceType
  original_text?: string
  project_type?: ProjectType
  building_type?: BuildingType
  building_age_years?: number
  building_size_m2?: number
  detected_rooms?: DetectedRoom[]
  detected_components?: DetectedComponent[]
  detected_quick_jobs?: DetectedQuickJob[]
  customer_priority?: CustomerPriority
  urgency_level?: UrgencyLevel
  access_restrictions?: string
  working_hours_constraints?: string
  special_requirements?: string[]
  overall_confidence?: number
  parsing_notes?: string
}

// =====================================================
// CALCULATION SNAPSHOTS
// =====================================================

export interface CalculationSnapshotData {
  items: unknown[] // Full calculation items
  totals: {
    total_time_minutes: number
    total_labor_cost: number
    total_material_cost: number
    total_price: number
    margin_percentage: number
  }
  factors: {
    building_profile?: unknown
    labor_type?: unknown
    global_factors?: unknown
  }
  metadata: {
    created_at: string
    version: string
  }
}

export interface CalculationSnapshot {
  id: string
  calculation_id: string | null
  offer_id: string | null
  version: number
  snapshot_reason: string | null

  calculation_data: CalculationSnapshotData

  // Summary metrics
  total_time_minutes: number | null
  total_labor_cost: number | null
  total_material_cost: number | null
  total_price: number | null
  margin_percentage: number | null
  effective_hourly_rate: number | null

  // Metadata
  component_count: number | null
  room_count: number | null
  risk_level: 'low' | 'medium' | 'high' | null

  // Audit
  created_by: string | null
  created_at: string
}

// =====================================================
// RISK ASSESSMENTS
// =====================================================

export interface MitigationOption {
  action: string
  impact: string
  cost?: number
}

export interface RiskAssessment {
  id: string
  calculation_id: string | null
  snapshot_id: string | null

  category: RiskCategory
  severity: RiskSeverity

  title: string
  description: string

  detection_rule: string | null
  detection_data: unknown | null
  confidence: number

  recommendation: string | null
  mitigation_options: MitigationOption[]

  show_to_customer: boolean
  customer_message: string | null

  is_acknowledged: boolean
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolution_notes: string | null

  created_at: string
}

export interface RiskAssessmentCreate {
  calculation_id?: string
  snapshot_id?: string
  category: RiskCategory
  severity: RiskSeverity
  title: string
  description: string
  detection_rule?: string
  detection_data?: unknown
  confidence?: number
  recommendation?: string
  mitigation_options?: MitigationOption[]
  show_to_customer?: boolean
  customer_message?: string
}

// =====================================================
// PRICE EXPLANATIONS
// =====================================================

export interface PriceExplanationSections {
  summary?: string
  labor_explanation?: string
  material_explanation?: string
  value_propositions?: string[]
  whats_included?: string[]
  whats_not_included?: string[]
  quality_guarantees?: string[]
  payment_terms?: string
}

export interface PriceBreakdownCategory {
  name: string
  amount: number
  percentage: number
  description?: string
}

export interface PriceBreakdownRoom {
  name: string
  amount: number
  component_count?: number
}

export interface PriceBreakdownData {
  categories?: PriceBreakdownCategory[]
  rooms?: PriceBreakdownRoom[]
  timeline?: string
  labor_hours?: number
  material_items?: number
}

export interface PriceExplanation {
  id: string
  calculation_id: string | null
  snapshot_id: string | null
  offer_id: string | null

  language: string
  format: 'simple' | 'detailed' | 'itemized'

  sections: PriceExplanationSections
  breakdown_data: PriceBreakdownData

  template_version: string | null
  generated_at: string

  created_by: string | null
  created_at: string
}

// =====================================================
// AI PROMPT TEMPLATES (Future Integration)
// =====================================================

export interface AIPromptTemplate {
  id: string
  code: string
  name: string
  description: string | null

  system_prompt: string
  user_prompt_template: string

  purpose: 'parse_project' | 'assess_risks' | 'generate_text' | 'explain_price'
  model_preference: string
  max_tokens: number
  temperature: number

  output_schema: unknown | null

  version: number
  is_active: boolean

  created_by: string | null
  created_at: string
  updated_at: string
}

// =====================================================
// PROJECT KEYWORDS
// =====================================================

export interface ProjectKeyword {
  id: string
  keyword: string
  keyword_type: 'room' | 'component' | 'job' | 'condition' | 'risk'
  target_code: string | null
  target_table: string | null
  match_type: 'exact' | 'contains' | 'starts_with' | 'regex'
  priority: number
  synonyms: string[]
  language: string
  is_active: boolean
  created_at: string
}

// =====================================================
// RISK DETECTION RULES
// =====================================================

export interface RiskCondition {
  type: 'threshold' | 'presence' | 'absence' | 'combination'
  field?: string
  operator?: '>' | '<' | '>=' | '<=' | '=' | '!='
  value?: number | string
  contains?: string
  and?: RiskCondition[]
  or?: RiskCondition[]
}

export interface RiskDetectionRule {
  id: string
  code: string
  name: string
  description: string | null

  category: RiskCategory
  default_severity: RiskSeverity

  conditions: RiskCondition

  title_template: string
  description_template: string
  recommendation_template: string | null
  customer_message_template: string | null

  show_to_customer: boolean
  is_active: boolean
  priority: number

  created_at: string
}

// =====================================================
// OFFER GENERATION
// =====================================================

export interface GeneratedOfferContent {
  technical_scope?: string[]
  exclusions?: string[]
  assumptions?: string[]
  optional_upgrades?: Array<{
    title: string
    description: string
    price: number
  }>
  obs_points?: string[]
  warranty_notes?: string[]
}

export interface OfferGenerationLog {
  id: string
  offer_id: string
  calculation_id: string | null

  generation_type: 'scope' | 'exclusions' | 'assumptions' | 'upgrades' | 'full'
  generated_content: GeneratedOfferContent
  templates_used: string[]

  generation_time_ms: number | null
  tokens_used: number | null

  was_edited: boolean
  final_content: GeneratedOfferContent | null

  created_by: string | null
  created_at: string
}

// =====================================================
// INPUT TYPES FOR ENGINES
// =====================================================

export interface ProjectIntakeInput {
  description: string
  building_type?: BuildingType
  building_age?: number
  building_size_m2?: number
  customer_priority?: CustomerPriority
  urgency?: UrgencyLevel
}

export interface ProjectIntakeResult {
  context: ProjectContextCreate
  suggested_rooms: DetectedRoom[]
  suggested_components: DetectedComponent[]
  suggested_quick_jobs: DetectedQuickJob[]
  confidence: number
  parsing_notes: string[]
}

export interface RiskAnalysisInput {
  calculation_id?: string
  building_age_years?: number
  building_type?: BuildingType
  rooms?: string[]
  component_count?: number
  total_price?: number
  margin_percentage?: number
  has_outdoor_work?: boolean
  has_bathroom_work?: boolean
}

export interface RiskAnalysisResult {
  risks: RiskAssessmentCreate[]
  overall_risk_level: 'low' | 'medium' | 'high'
  customer_visible_risks: RiskAssessmentCreate[]
  recommendations: string[]
}

export interface PriceExplanationInput {
  labor_cost: number
  material_cost: number
  total_price: number
  margin_percentage: number
  components: Array<{
    name: string
    quantity: number
    price: number
  }>
  rooms?: string[]
  project_type?: ProjectType
  building_type?: BuildingType
}

export interface PriceExplanationResult {
  sections: PriceExplanationSections
  breakdown: PriceBreakdownData
}
