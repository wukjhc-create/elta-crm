/**
 * Auto Project Engine Types
 * Types for the intelligent project calculation system
 */

// =====================================================
// Project Interpretation Types
// =====================================================

export type BuildingType = 'house' | 'apartment' | 'commercial' | 'industrial' | 'unknown'

export interface Room {
  name: string
  type: 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'office' | 'utility' | 'garage' | 'outdoor' | 'other'
  size_m2?: number
  electrical_points?: ElectricalPoints
}

export interface ElectricalPoints {
  outlets?: number
  double_outlets?: number
  switches?: number
  multi_switches?: number
  dimmers?: number
  spots?: number
  ceiling_lights?: number
  outdoor_lights?: number
  power_16a?: number
  power_32a?: number
  ev_charger?: number
  data_outlets?: number
  tv_outlets?: number
}

export interface CableRequirements {
  nym_1_5mm: number // meters
  nym_2_5mm: number
  nym_4mm: number
  nym_6mm: number
  nym_10mm: number
  outdoor_cable: number
  data_cable: number
}

export interface PanelRequirements {
  upgrade_needed: boolean
  current_groups?: number
  required_groups: number
  current_amperage?: number
  required_amperage: number
  new_panel_needed: boolean
}

export interface RiskFactor {
  type: 'electrical' | 'structural' | 'scope' | 'pricing' | 'timeline' | 'safety'
  code: string
  title: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  recommendation?: string
  offer_text?: string
}

export interface ComplexityFactor {
  code: string
  name: string
  category: string
  multiplier: number
  detected_from?: string
}

export interface ProjectInterpretation {
  id: string
  raw_description: string

  // Extracted data
  building_type: BuildingType
  building_size_m2: number | null
  building_age_years: number | null
  rooms: Room[]

  // Electrical
  electrical_points: ElectricalPoints
  cable_requirements: CableRequirements
  panel_requirements: PanelRequirements

  // Analysis
  complexity_score: number // 1-5
  complexity_factors: ComplexityFactor[]
  risk_score: number // 1-5
  risk_factors: RiskFactor[]

  // AI metadata
  ai_model: string
  ai_confidence: number
  interpretation_time_ms: number

  created_by?: string
  created_at: string
}

// =====================================================
// Calculation Types
// =====================================================

export interface CalculationComponent {
  component_id?: string
  name: string
  code: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  time_minutes: number
  category: string
}

export interface CalculationMaterial {
  material_id?: string
  supplier_product_id?: string
  name: string
  sku?: string
  supplier_name?: string
  quantity: number
  unit: string
  unit_cost: number
  unit_price: number
  total_cost: number
  total_price: number
}

export interface TimeCalculation {
  base_hours: number
  complexity_multiplier: number
  size_multiplier: number
  accessibility_multiplier: number
  total_hours: number
  breakdown: {
    category: string
    hours: number
    description: string
  }[]
}

export interface PriceCalculation {
  material_cost: number
  labor_cost: number
  subtotal: number
  margin_percentage: number
  margin_amount: number
  risk_buffer_percentage: number
  risk_buffer_amount: number
  total_price: number
  hourly_rate: number
}

export interface AutoCalculation {
  id: string
  interpretation_id: string

  components: CalculationComponent[]
  materials: CalculationMaterial[]

  time: TimeCalculation
  price: PriceCalculation

  calculation_version: string
  calculated_at: string
}

// =====================================================
// Offer Text Types
// =====================================================

export interface OfferTextSections {
  work_description: string
  scope_description: string
  materials_description: string
  timeline_description: string
  reservations: string
  terms: string
}

export interface AutoOfferText {
  id: string
  calculation_id: string
  sections: OfferTextSections
  full_offer_text: string
  template_id?: string
  generated_at: string
  edited_at?: string
  is_edited: boolean
}

// =====================================================
// Input/Output Types
// =====================================================

export interface AnalyzeProjectInput {
  description: string
  customer_id?: string
  additional_context?: string
}

export interface AnalyzeProjectOutput {
  interpretation: ProjectInterpretation
  calculation: AutoCalculation
  risks: RiskFactor[]
  offer_text: AutoOfferText
}

export interface ProjectAnalysisProgress {
  stage: 'interpreting' | 'matching' | 'calculating' | 'analyzing_risks' | 'generating_text' | 'complete'
  progress: number // 0-100
  message: string
}

// =====================================================
// Reference Data Types
// =====================================================

export interface ComplexityFactorRef {
  id: string
  name: string
  code: string
  category: string
  multiplier: number
  description?: string
  detection_keywords: string[]
}

export interface ElectricalPointTypeRef {
  id: string
  name: string
  code: string
  category: string
  base_time_minutes: number
  base_material_cost: number
  detection_keywords: string[]
}

export interface OfferTextTemplate {
  id: string
  name: string
  category: string
  work_description_template: string
  scope_template: string
  materials_template: string
  timeline_template: string
  reservations_template: string
  terms_template: string
  available_placeholders: string[]
  is_default: boolean
  is_active: boolean
}

// =====================================================
// Feedback Types
// =====================================================

export interface CalculationFeedback {
  id: string
  calculation_id: string
  offer_id?: string
  project_id?: string

  estimated_hours: number
  actual_hours?: number
  hours_variance_percentage?: number

  estimated_material_cost: number
  actual_material_cost?: number
  material_variance_percentage?: number

  offer_accepted?: boolean
  project_profitable?: boolean
  customer_satisfaction?: number

  lessons_learned?: string
  adjustment_suggestions: string[]

  created_at: string
  updated_at: string
}
