// =====================================================
// Calculation Intelligence Types
// Advanced calculation engine for professional electricians
// =====================================================

// =====================================================
// Installation Types
// =====================================================

export interface InstallationType {
  id: string
  code: string
  name: string
  description: string | null
  time_multiplier: number
  difficulty_multiplier: number
  material_waste_multiplier: number
  extra_materials: ExtraMaterial[]
  required_tools: RequiredTool[]
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ExtraMaterial {
  material_name: string
  quantity_per_unit: number
  unit: string
}

export interface RequiredTool {
  tool_name: string
  is_special: boolean
}

// =====================================================
// Room Templates
// =====================================================

export interface RoomTemplate {
  id: string
  code: string
  name: string
  description: string | null
  room_type: string
  default_points: Record<string, number>
  typical_size_m2: number | null
  recommended_circuit_groups: number
  recommended_rcd: boolean
  special_requirements: SpecialRequirement[]
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SpecialRequirement {
  requirement: string
  description: string
}

// =====================================================
// Component Time Intelligence
// =====================================================

export interface ComponentTimeIntelligence {
  id: string
  component_type: string
  component_subtype: string | null
  installation_type_id: string | null
  base_install_time_seconds: number
  wiring_time_seconds: number
  finishing_time_seconds: number
  cable_meters_per_unit: number
  cable_type: string
  materials_per_unit: ComponentMaterial[]
  material_cost_estimate: number
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ComponentMaterial {
  name: string
  sku_pattern?: string
  quantity: number
  unit: string
}

// =====================================================
// Room Calculations
// =====================================================

export interface RoomCalculation {
  id: string
  calculation_id: string
  room_name: string
  room_template_id: string | null
  room_type: string
  size_m2: number | null
  floor_number: number
  installation_type_id: string | null
  ceiling_height_m: number
  points: Record<string, number>
  total_time_seconds: number
  total_material_cost: number
  total_cable_meters: number
  total_labor_cost: number
  total_cost: number
  component_breakdown: ComponentBreakdownItem[]
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ComponentBreakdownItem {
  type: string
  subtype: string | null
  quantity: number
  time_seconds: number
  material_cost: number
  cable_meters: number
  materials: Array<{
    name: string
    quantity: number
    unit: string
    unit_cost: number
    total_cost: number
    supplier_product_id?: string
  }>
}

export interface RoomCalculationWithRelations extends RoomCalculation {
  room_template?: RoomTemplate | null
  installation_type?: InstallationType | null
}

// =====================================================
// Calculation Result Types
// =====================================================

export interface RoomEstimate {
  room_name: string
  room_type: string
  points: Record<string, number>
  total_time_seconds: number
  total_material_cost: number
  total_cable_meters: number
  total_labor_cost: number
  total_cost: number
  component_breakdown: ComponentBreakdownItem[]
  warnings: string[]
  recommendations: string[]
}

export interface ProjectEstimate {
  rooms: RoomEstimate[]
  panel_requirements: PanelRequirements
  cable_summary: CableSummary
  total_time_seconds: number
  total_labor_hours: number
  total_material_cost: number
  total_cable_meters: number
  total_labor_cost: number
  total_other_costs: number
  cost_price: number
  overhead_amount: number
  risk_amount: number
  margin_amount: number
  sale_price_excl_vat: number
  vat_amount: number
  final_amount: number
  db_amount: number
  db_percentage: number
  db_per_hour: number
  warnings: string[]
  obs_points: string[]
  risk_analysis: RiskAnalysisResult
}

export interface PanelRequirements {
  total_groups_needed: number
  rcd_groups_needed: number
  main_breaker_upgrade: boolean
  surge_protection_recommended: boolean
  estimated_panel_cost: number
  details: Array<{
    description: string
    quantity: number
    estimated_cost: number
  }>
}

export interface CableSummary {
  cable_types: Array<{
    type: string
    total_meters: number
    estimated_cost_per_meter: number
    total_cost: number
  }>
  total_meters: number
  total_cable_cost: number
}

export interface RiskAnalysisResult {
  risk_score: number // 1-5
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  factors: RiskFactor[]
  recommended_buffer_percentage: number
}

export interface RiskFactor {
  type: string
  description: string
  severity: 'low' | 'medium' | 'high'
  impact_percentage: number
}

// =====================================================
// Calculation Anomaly
// =====================================================

export type AnomalyType = 'price_deviation' | 'time_outlier' | 'missing_material' | 'margin_warning' | 'missing_rcd' | 'undersized_cable'
export type AnomalySeverity = 'info' | 'warning' | 'critical'

export interface CalculationAnomaly {
  id: string
  calculation_id: string
  anomaly_type: AnomalyType
  severity: AnomalySeverity
  message: string
  details: Record<string, unknown>
  is_resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  resolution_notes: string | null
  created_at: string
}

// =====================================================
// Offer Text Templates
// =====================================================

export interface OfferTextTemplate {
  id: string
  name: string
  template_type: string
  language: string
  template_text: string
  applicable_building_types: string[]
  applicable_project_types: string[]
  min_amount: number | null
  max_amount: number | null
  sort_order: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// =====================================================
// System Alerts
// =====================================================

export type AlertType = 'price_increase' | 'price_decrease' | 'margin_below' | 'supplier_offline' | 'anomaly_detected' | 'sync_failed'
export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface SystemAlert {
  id: string
  alert_type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  details: Record<string, unknown>
  entity_type: string | null
  entity_id: string | null
  is_read: boolean
  is_dismissed: boolean
  read_at: string | null
  dismissed_at: string | null
  dismissed_by: string | null
  created_at: string
}

// =====================================================
// Profit Simulator
// =====================================================

export interface ProfitSimulationInput {
  cost_price: number
  hourly_rate: number
  total_hours: number
  material_cost: number
  overhead_percentage: number
  risk_percentage: number
  margin_percentage: number
  discount_percentage: number
  vat_percentage: number
}

export interface ProfitSimulationResult {
  // Base
  cost_price: number
  labor_cost: number
  material_cost: number

  // Overhead
  overhead_amount: number
  risk_amount: number
  sales_basis: number

  // Pricing scenarios
  scenarios: ProfitScenario[]
}

export interface ProfitScenario {
  name: string
  margin_percentage: number
  discount_percentage: number
  sale_price_excl_vat: number
  discount_amount: number
  net_price: number
  vat_amount: number
  final_amount: number
  db_amount: number
  db_percentage: number
  db_per_hour: number
}

// =====================================================
// Input Types
// =====================================================

export interface CreateRoomCalculationInput {
  calculation_id: string
  room_name: string
  room_template_id?: string
  room_type: string
  size_m2?: number
  floor_number?: number
  installation_type_id?: string
  ceiling_height_m?: number
  points: Record<string, number>
  notes?: string
  sort_order?: number
}

export interface ProjectCalculationInput {
  rooms: CreateRoomCalculationInput[]
  building_type?: string
  building_age_years?: number
  hourly_rate?: number
  overhead_percentage?: number
  risk_percentage?: number
  margin_percentage?: number
  discount_percentage?: number
  vat_percentage?: number
  customer_id?: string
}
