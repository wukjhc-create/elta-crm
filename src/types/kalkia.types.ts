// =====================================================
// Kalkia Professional Calculation System Types
// =====================================================

// =====================================================
// Node Types
// =====================================================

export const KALKIA_NODE_TYPES = ['group', 'operation', 'composite'] as const
export type KalkiaNodeType = (typeof KALKIA_NODE_TYPES)[number]

export const KALKIA_NODE_TYPE_LABELS: Record<KalkiaNodeType, string> = {
  group: 'Gruppe',
  operation: 'Operation',
  composite: 'Sammensat',
}

// =====================================================
// Rule Types
// =====================================================

export const KALKIA_RULE_TYPES = ['height', 'quantity', 'access', 'distance', 'custom'] as const
export type KalkiaRuleType = (typeof KALKIA_RULE_TYPES)[number]

export const KALKIA_RULE_TYPE_LABELS: Record<KalkiaRuleType, string> = {
  height: 'Hoejde',
  quantity: 'Antal',
  access: 'Adgang',
  distance: 'Afstand',
  custom: 'Tilpasset',
}

// =====================================================
// Calculation Status
// =====================================================

export const KALKIA_CALCULATION_STATUSES = ['draft', 'active', 'archived', 'converted'] as const
export type KalkiaCalculationStatus = (typeof KALKIA_CALCULATION_STATUSES)[number]

export const KALKIA_CALCULATION_STATUS_LABELS: Record<KalkiaCalculationStatus, string> = {
  draft: 'Kladde',
  active: 'Aktiv',
  archived: 'Arkiveret',
  converted: 'Konverteret',
}

// =====================================================
// Global Factor Categories
// =====================================================

export const KALKIA_FACTOR_CATEGORIES = ['time', 'cost', 'pricing', 'waste', 'labor'] as const
export type KalkiaFactorCategory = (typeof KALKIA_FACTOR_CATEGORIES)[number]

export const KALKIA_FACTOR_CATEGORY_LABELS: Record<KalkiaFactorCategory, string> = {
  time: 'Tid',
  cost: 'Omkostning',
  pricing: 'Prissaetning',
  waste: 'Spild',
  labor: 'Arbejdskraft',
}

// =====================================================
// Value Types for Factors
// =====================================================

export const KALKIA_VALUE_TYPES = ['percentage', 'multiplier', 'fixed'] as const
export type KalkiaValueType = (typeof KALKIA_VALUE_TYPES)[number]

export const KALKIA_VALUE_TYPE_LABELS: Record<KalkiaValueType, string> = {
  percentage: 'Procent',
  multiplier: 'Multiplikator',
  fixed: 'Fast vaerdi',
}

// =====================================================
// Kalkia Node
// =====================================================

export interface KalkiaNode {
  id: string
  parent_id: string | null
  path: string
  depth: number
  code: string
  name: string
  description: string | null
  node_type: KalkiaNodeType
  base_time_seconds: number
  category_id: string | null
  default_cost_price: number
  default_sale_price: number
  difficulty_level: number
  requires_certification: boolean
  is_active: boolean
  ai_tags: string[]
  notes: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface KalkiaNodeWithRelations extends KalkiaNode {
  category?: {
    id: string
    name: string
    slug: string
  } | null
  variants?: KalkiaVariant[]
  rules?: KalkiaRule[]
  children?: KalkiaNodeWithRelations[]
  parent?: KalkiaNode | null
}

export interface KalkiaNodeSummary {
  id: string
  code: string
  name: string
  description: string | null
  node_type: KalkiaNodeType
  path: string
  depth: number
  base_time_seconds: number
  default_cost_price: number
  default_sale_price: number
  difficulty_level: number
  is_active: boolean
  category_name: string | null
  category_slug: string | null
  child_count: number
  variant_count: number
  rule_count: number
  created_at: string
  updated_at: string
}

// =====================================================
// Kalkia Variant
// =====================================================

export interface KalkiaVariant {
  id: string
  node_id: string
  code: string
  name: string
  description: string | null
  base_time_seconds: number
  time_multiplier: number
  extra_time_seconds: number
  price_multiplier: number
  cost_multiplier: number
  waste_percentage: number
  is_default: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface KalkiaVariantWithMaterials extends KalkiaVariant {
  materials?: KalkiaVariantMaterial[]
}

// =====================================================
// Kalkia Variant Material
// =====================================================

export interface KalkiaVariantMaterial {
  id: string
  variant_id: string
  product_id: string | null
  material_name: string
  quantity: number
  unit: string
  cost_price: number | null
  sale_price: number | null
  is_optional: boolean
  sort_order: number
  supplier_product_id: string | null
  auto_update_price: boolean
  created_at: string
  product?: {
    id: string
    name: string
    sku: string
    cost_price: number | null
    list_price: number
  } | null
  supplier_product?: {
    id: string
    supplier_sku: string
    supplier_name: string
    cost_price: number
    list_price: number | null
    supplier: {
      name: string
      code: string | null
    }
  } | null
}

// =====================================================
// Kalkia Building Profile
// =====================================================

export interface KalkiaBuildingProfile {
  id: string
  code: string
  name: string
  description: string | null
  time_multiplier: number
  difficulty_multiplier: number
  material_waste_multiplier: number
  overhead_multiplier: number
  typical_wall_type: string | null
  typical_access: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// =====================================================
// Kalkia Global Factor
// =====================================================

export interface KalkiaGlobalFactor {
  id: string
  factor_key: string
  factor_name: string
  description: string | null
  category: KalkiaFactorCategory
  value_type: KalkiaValueType
  value: number
  min_value: number | null
  max_value: number | null
  applies_to: string[]
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// =====================================================
// Kalkia Rule
// =====================================================

export interface KalkiaRule {
  id: string
  node_id: string | null
  variant_id: string | null
  rule_name: string
  rule_type: KalkiaRuleType
  condition: Record<string, unknown>
  time_multiplier: number
  extra_time_seconds: number
  cost_multiplier: number
  extra_cost: number
  description: string | null
  priority: number
  is_active: boolean
  created_at: string
}

// =====================================================
// Kalkia Calculation
// =====================================================

export interface KalkiaCalculation {
  id: string
  name: string
  description: string | null
  customer_id: string | null
  building_profile_id: string | null

  // Time tracking (seconds)
  total_direct_time_seconds: number
  total_indirect_time_seconds: number
  total_personal_time_seconds: number
  total_labor_time_seconds: number

  // Cost breakdown
  hourly_rate: number
  total_material_cost: number
  total_material_waste: number
  total_labor_cost: number
  total_other_costs: number
  cost_price: number

  // Overhead and basis
  overhead_percentage: number
  overhead_amount: number
  risk_percentage: number
  risk_amount: number
  sales_basis: number

  // Pricing
  margin_percentage: number
  margin_amount: number
  sale_price_excl_vat: number
  discount_percentage: number
  discount_amount: number
  net_price: number
  vat_percentage: number
  vat_amount: number
  final_amount: number

  // Key metrics
  db_amount: number
  db_percentage: number
  db_per_hour: number
  coverage_ratio: number

  // Snapshots
  factors_snapshot: Record<string, unknown>
  building_profile_snapshot: Record<string, unknown>

  // Status
  status: KalkiaCalculationStatus
  is_template: boolean

  // Metadata
  created_by: string
  created_at: string
  updated_at: string
}

export interface KalkiaCalculationWithRelations extends KalkiaCalculation {
  customer?: {
    id: string
    company_name: string
    customer_number: string
  } | null
  building_profile?: KalkiaBuildingProfile | null
  rows?: KalkiaCalculationRowWithRelations[]
  created_by_profile?: {
    id: string
    full_name: string | null
    email: string
  } | null
}

export interface KalkiaCalculationSummary {
  id: string
  name: string
  description: string | null
  status: KalkiaCalculationStatus
  is_template: boolean
  customer_name: string | null
  building_profile_name: string | null
  total_labor_time_seconds: number
  total_labor_hours: number
  total_material_cost: number
  total_labor_cost: number
  cost_price: number
  sale_price_excl_vat: number
  final_amount: number
  db_amount: number
  db_percentage: number
  db_per_hour: number
  coverage_ratio: number
  row_count: number
  created_by_name: string | null
  created_at: string
  updated_at: string
}

// =====================================================
// Kalkia Calculation Row
// =====================================================

export interface KalkiaCalculationRow {
  id: string
  calculation_id: string
  node_id: string | null
  variant_id: string | null

  // Row info
  position: number
  section: string | null
  description: string

  // Quantity
  quantity: number
  unit: string

  // Time (seconds)
  base_time_seconds: number
  adjusted_time_seconds: number

  // Costs
  material_cost: number
  material_waste: number
  labor_cost: number
  total_cost: number

  // Pricing
  sale_price: number
  total_sale: number

  // Applied adjustments
  rules_applied: unknown[]
  conditions: Record<string, unknown>

  // Display options
  show_on_offer: boolean
  is_optional: boolean

  created_at: string
  updated_at: string
}

export interface KalkiaCalculationRowWithRelations extends KalkiaCalculationRow {
  node?: KalkiaNode | null
  variant?: KalkiaVariant | null
}

// =====================================================
// Calculation Engine Types
// =====================================================

export interface CalculationContext {
  buildingProfile: KalkiaBuildingProfile | null
  globalFactors: KalkiaGlobalFactor[]
  hourlyRate: number
  /** Optional customer ID for customer-specific pricing */
  customerId?: string
  /** Supplier price overrides keyed by material ID */
  supplierPrices?: Map<string, SupplierPriceOverride>
}

export interface SupplierPriceOverride {
  materialId: string
  supplierProductId: string
  supplierName: string
  supplierSku: string
  baseCostPrice: number
  effectiveCostPrice: number
  effectiveSalePrice: number
  discountPercentage: number
  marginPercentage: number
  priceSource: string
  isStale: boolean
  lastSyncedAt: string | null
}

export interface CalculationConditions {
  height?: number
  quantity?: number
  access?: 'easy' | 'normal' | 'difficult'
  distance?: number
  custom?: Record<string, unknown>
}

export interface CalculatedItem {
  nodeId: string
  variantId: string | null
  quantity: number
  description: string
  unit: string

  // Time breakdown
  baseTimeSeconds: number
  adjustedTimeSeconds: number
  rulesApplied: string[]

  // Cost breakdown
  materialCost: number
  materialWaste: number
  laborCost: number
  totalCost: number

  // Pricing
  salePrice: number
  totalSale: number

  conditions: CalculationConditions
}

export interface CalculationResult {
  // Time totals (seconds)
  totalDirectTimeSeconds: number
  totalIndirectTimeSeconds: number
  totalPersonalTimeSeconds: number
  totalLaborTimeSeconds: number
  totalLaborHours: number

  // Cost totals
  totalMaterialCost: number
  totalMaterialWaste: number
  totalLaborCost: number
  totalOtherCosts: number
  costPrice: number

  // Pricing breakdown
  overheadAmount: number
  riskAmount: number
  salesBasis: number
  marginAmount: number
  salePriceExclVat: number
  discountAmount: number
  netPrice: number
  vatAmount: number
  finalAmount: number

  // Key metrics
  dbAmount: number        // Daekningsbidrag (Contribution margin)
  dbPercentage: number    // DB%
  dbPerHour: number       // DB/time
  coverageRatio: number   // Daekningsgrad

  // Applied factors
  factorsUsed: {
    indirectTimeFactor: number
    personalTimeFactor: number
    overheadFactor: number
    materialWasteFactor: number
  }
}

// =====================================================
// Input Types
// =====================================================

export interface CreateKalkiaNodeInput {
  parent_id?: string | null
  code: string
  name: string
  description?: string | null
  node_type: KalkiaNodeType
  base_time_seconds?: number
  category_id?: string | null
  default_cost_price?: number
  default_sale_price?: number
  difficulty_level?: number
  requires_certification?: boolean
  is_active?: boolean
  ai_tags?: string[]
  notes?: string | null
  sort_order?: number
}

export interface UpdateKalkiaNodeInput extends Partial<CreateKalkiaNodeInput> {
  id: string
}

export interface CreateKalkiaVariantInput {
  node_id: string
  code: string
  name: string
  description?: string | null
  base_time_seconds?: number
  time_multiplier?: number
  extra_time_seconds?: number
  price_multiplier?: number
  cost_multiplier?: number
  waste_percentage?: number
  is_default?: boolean
  sort_order?: number
}

export interface UpdateKalkiaVariantInput extends Partial<Omit<CreateKalkiaVariantInput, 'node_id'>> {
  id: string
}

export interface CreateKalkiaVariantMaterialInput {
  variant_id: string
  product_id?: string | null
  material_name: string
  quantity?: number
  unit?: string
  cost_price?: number | null
  sale_price?: number | null
  is_optional?: boolean
  sort_order?: number
}

export interface UpdateKalkiaVariantMaterialInput extends Partial<Omit<CreateKalkiaVariantMaterialInput, 'variant_id'>> {
  id: string
}

export interface CreateKalkiaBuildingProfileInput {
  code: string
  name: string
  description?: string | null
  time_multiplier?: number
  difficulty_multiplier?: number
  material_waste_multiplier?: number
  overhead_multiplier?: number
  typical_wall_type?: string | null
  typical_access?: string
  is_active?: boolean
  sort_order?: number
}

export interface UpdateKalkiaBuildingProfileInput extends Partial<CreateKalkiaBuildingProfileInput> {
  id: string
}

export interface CreateKalkiaGlobalFactorInput {
  factor_key: string
  factor_name: string
  description?: string | null
  category: KalkiaFactorCategory
  value_type: KalkiaValueType
  value: number
  min_value?: number | null
  max_value?: number | null
  applies_to?: string[]
  is_active?: boolean
  sort_order?: number
}

export interface UpdateKalkiaGlobalFactorInput extends Partial<CreateKalkiaGlobalFactorInput> {
  id: string
}

export interface CreateKalkiaRuleInput {
  node_id?: string | null
  variant_id?: string | null
  rule_name: string
  rule_type: KalkiaRuleType
  condition?: Record<string, unknown>
  time_multiplier?: number
  extra_time_seconds?: number
  cost_multiplier?: number
  extra_cost?: number
  description?: string | null
  priority?: number
  is_active?: boolean
}

export interface UpdateKalkiaRuleInput extends Partial<CreateKalkiaRuleInput> {
  id: string
}

export interface CreateKalkiaCalculationInput {
  name: string
  description?: string | null
  customer_id?: string | null
  building_profile_id?: string | null
  hourly_rate?: number
  margin_percentage?: number
  discount_percentage?: number
  vat_percentage?: number
  overhead_percentage?: number
  risk_percentage?: number
  is_template?: boolean
}

export interface UpdateKalkiaCalculationInput extends Partial<CreateKalkiaCalculationInput> {
  id: string
  status?: KalkiaCalculationStatus
}

export interface CreateKalkiaCalculationRowInput {
  calculation_id: string
  node_id?: string | null
  variant_id?: string | null
  position?: number
  section?: string | null
  description: string
  quantity?: number
  unit?: string
  conditions?: CalculationConditions
  show_on_offer?: boolean
  is_optional?: boolean
}

export interface UpdateKalkiaCalculationRowInput extends Partial<Omit<CreateKalkiaCalculationRowInput, 'calculation_id'>> {
  id: string
}

// =====================================================
// Filter Types
// =====================================================

export interface KalkiaNodeFilters {
  search?: string
  node_type?: KalkiaNodeType
  category_id?: string
  parent_id?: string | null
  is_active?: boolean
  path_prefix?: string
  depth?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface KalkiaCalculationFilters {
  search?: string
  customer_id?: string
  building_profile_id?: string
  status?: KalkiaCalculationStatus
  is_template?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

// =====================================================
// Calculation Item Input (for engine)
// =====================================================

export interface KalkiaCalculationItemInput {
  nodeId: string
  variantId?: string | null
  quantity: number
  conditions?: CalculationConditions
  section?: string
}
