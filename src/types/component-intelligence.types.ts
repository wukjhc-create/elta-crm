// =====================================================
// Component Intelligence Types
// Phase C - Professional Electrician Intelligence Layer
// =====================================================

// =====================================================
// Time Profiles
// =====================================================

export const TIME_PROFILES = ['linear', 'diminishing', 'stepped', 'fixed', 'batch'] as const
export type TimeProfile = (typeof TIME_PROFILES)[number]

export const TIME_PROFILE_LABELS: Record<TimeProfile, string> = {
  linear: 'Lineær (tid × antal)',
  diminishing: 'Aftagende (første enhed tager længere)',
  stepped: 'Trinvis (tid stiger i spring)',
  fixed: 'Fast (uanset antal)',
  batch: 'Batch (opsætningstid + stykpris)',
}

export const TIME_PROFILE_DESCRIPTIONS: Record<TimeProfile, string> = {
  linear: 'Tid skalerer lineært med antal enheder',
  diminishing: 'Første enhed tager længere tid, efterfølgende er hurtigere pga. opsætning',
  stepped: 'Tid øges i trin (f.eks. hver 5 enheder)',
  fixed: 'Fast tid uanset antal (f.eks. fejlfinding)',
  batch: 'Optimal batchstørrelse med opsætningstid',
}

// =====================================================
// Component Intelligence Extension
// =====================================================

export interface ComponentIntelligence {
  // Time intelligence
  first_unit_time_minutes: number | null
  subsequent_unit_time_minutes: number | null
  setup_time_minutes: number
  cleanup_time_minutes: number
  time_profile: TimeProfile

  // Quantity intelligence
  min_quantity: number
  max_quantity: number | null
  optimal_batch_size: number | null
  quantity_step: number

  // Dependencies
  dependencies: string[]           // Component codes that must be present
  incompatibilities: string[]      // Component codes that conflict
  requires_components: string[]    // Auto-added components
  suggested_with: string[]         // Suggested components

  // Offer text
  offer_description: string | null
  offer_obs_points: string[]
  installation_notes: string | null
  certification_required: string[]

  // Pricing intelligence
  price_includes_material: boolean
  labor_only: boolean
  volume_discount_threshold: number | null
  volume_discount_percent: number | null
}

// =====================================================
// Room Types
// =====================================================

export interface RoomType {
  id: string
  code: string
  name: string
  description: string | null

  // Size characteristics
  typical_size_m2: number | null
  min_size_m2: number | null
  max_size_m2: number | null

  // Electrical requirements
  ip_rating_required: string
  typical_circuits: number
  requires_rcd: boolean

  // Standard components
  standard_components: Record<string, RoomComponentConfig>

  // Scaling
  size_scaling_factor: number

  // Display
  icon: string
  color: string
  sort_order: number

  // Status
  is_active: boolean
  created_at: string
  updated_at: string
}

export type RoomTypeCreate = Omit<RoomType, 'id' | 'created_at' | 'updated_at'>
export type RoomTypeUpdate = Partial<RoomTypeCreate>

export interface RoomComponentConfig {
  base_qty: number
  per_m2: number
  min: number
  max: number
}

export interface RoomComponentSuggestion {
  component_code: string
  suggested_quantity: number
  min_quantity: number
  max_quantity: number
}

// =====================================================
// Room Templates
// =====================================================

export interface RoomTemplate {
  id: string
  room_type_id: string
  code: string
  name: string
  description: string | null
  tier: 'basic' | 'standard' | 'premium'

  components: RoomTemplateComponent[]

  estimated_time_minutes: number
  estimated_cost_price: number
  estimated_sale_price: number

  is_featured: boolean
  sort_order: number
  is_active: boolean

  created_by: string | null
  created_at: string
  updated_at: string
}

export interface RoomTemplateComponent {
  component_code: string
  variant_code: string | null
  quantity: number
  quantity_formula: string | null  // e.g., "ceil(size_m2 / 4)"
  notes: string | null
}

export interface RoomTemplateWithRelations extends RoomTemplate {
  room_type?: RoomType
}

// =====================================================
// Materials Catalog
// =====================================================

export interface Material {
  id: string
  sku: string | null
  name: string
  description: string | null

  category: string
  subcategory: string | null
  brand: string | null

  cost_price: number
  sale_price: number
  currency: string

  unit: string
  min_order_qty: number
  pack_size: number

  supplier_id: string | null
  supplier_sku: string | null
  lead_time_days: number | null

  track_stock: boolean
  stock_quantity: number
  reorder_level: number | null

  specifications: Record<string, unknown>
  images: string[]

  is_active: boolean
  discontinued_at: string | null

  created_by: string | null
  created_at: string
  updated_at: string
}

export interface MaterialPriceHistory {
  id: string
  material_id: string
  cost_price: number
  sale_price: number
  effective_from: string
  effective_to: string | null
  change_reason: string | null
  changed_by: string | null
  created_at: string
}

// =====================================================
// Offer Text Templates
// =====================================================

export const OFFER_TEXT_SCOPES = ['component', 'category', 'room_type', 'global'] as const
export type OfferTextScope = (typeof OFFER_TEXT_SCOPES)[number]
export type ScopeType = OfferTextScope

export const OFFER_TEXT_KEYS = ['description', 'obs_point', 'warranty_note', 'technical_note', 'installation_note', 'warranty', 'terms'] as const
export type OfferTextKey = (typeof OFFER_TEXT_KEYS)[number]
export type TextType = OfferTextKey

export interface OfferTextTemplate {
  id: string
  scope_type: OfferTextScope
  scope_id: string | null
  template_key: OfferTextKey
  title: string | null
  content: string
  conditions: OfferTextConditions
  priority: number
  is_required: boolean
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface OfferTextConditions {
  min_quantity?: number
  max_quantity?: number
  variant_codes?: string[]
  building_profiles?: string[]
  room_types?: string[]
  component_codes?: string[]
}

// =====================================================
// Calculated Time Result
// =====================================================

export interface IntelligentTimeCalculation {
  base_time: number
  first_unit_time: number
  subsequent_unit_time: number
  setup_time: number
  cleanup_time: number
  quantity: number
  time_profile: TimeProfile

  // Calculated
  total_minutes: number

  // Breakdown
  breakdown: {
    setup: number
    first_unit: number
    subsequent_units: number
    cleanup: number
  }
}

// =====================================================
// Room Calculation Input/Output
// =====================================================

export interface RoomCalculationInput {
  room_type_code: string
  size_m2: number
  tier?: 'basic' | 'standard' | 'premium'
  wall_type?: string
  building_profile_code?: string
}

export interface RoomCalculationOutput {
  room_type: RoomType
  size_m2: number
  components: RoomComponentSuggestion[]
  estimated_time_minutes: number
  estimated_cost: number
  estimated_price: number
  obs_points: string[]
}

// =====================================================
// Material Category Labels
// =====================================================

export const MATERIAL_CATEGORIES = [
  'cables',
  'outlets',
  'switches',
  'lighting',
  'panel',
  'accessories',
  'tools',
  'safety',
  'general',
] as const

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number]

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  cables: 'Kabler',
  outlets: 'Stikkontakter',
  switches: 'Afbrydere',
  lighting: 'Belysning',
  panel: 'Tavle',
  accessories: 'Tilbehør',
  tools: 'Værktøj',
  safety: 'Sikkerhed',
  general: 'Generelt',
}

// =====================================================
// Input Types
// =====================================================

export interface CreateMaterialInput {
  sku?: string
  name: string
  description?: string
  category: string
  subcategory?: string
  brand?: string
  cost_price: number
  sale_price: number
  unit?: string
  min_order_qty?: number
  pack_size?: number
  supplier_id?: string
  supplier_sku?: string
  lead_time_days?: number
  track_stock?: boolean
  stock_quantity?: number
  reorder_level?: number
  specifications?: Record<string, unknown>
}

export interface UpdateMaterialInput extends Partial<CreateMaterialInput> {
  id: string
}

export interface CreateRoomTemplateInput {
  room_type_id: string
  code: string
  name: string
  description?: string
  tier?: 'basic' | 'standard' | 'premium'
  components: RoomTemplateComponent[]
  is_featured?: boolean
  sort_order?: number
}

export interface UpdateRoomTemplateInput extends Partial<Omit<CreateRoomTemplateInput, 'code'>> {
  id: string
}

export interface CreateOfferTextInput {
  scope_type: OfferTextScope
  scope_id?: string
  template_key: OfferTextKey
  title?: string
  content: string
  conditions?: OfferTextConditions
  priority?: number
  is_required?: boolean
}

export interface UpdateOfferTextInput extends Partial<CreateOfferTextInput> {
  id: string
}

// Type aliases for UI components
export type OfferTextTemplateCreate = Omit<OfferTextTemplate, 'id' | 'created_at' | 'updated_at' | 'created_by'>
export type OfferTextTemplateUpdate = Partial<OfferTextTemplateCreate>

// Re-export for old interface name compatibility
export interface _UpdateOfferTextInput extends Partial<CreateOfferTextInput> {
  id: string
}
