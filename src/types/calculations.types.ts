// =====================================================
// Calculations Types
// =====================================================

import type { Product, SupplierProduct, ProductCategory } from './products.types'

// Calculation types
export const CALCULATION_TYPES = ['solar_system', 'electrical', 'custom'] as const
export type CalculationType = (typeof CALCULATION_TYPES)[number]

// Calculation type labels in Danish
export const CALCULATION_TYPE_LABELS: Record<CalculationType, string> = {
  solar_system: 'Solcelleanlæg',
  electrical: 'El-installation',
  custom: 'Tilpasset',
}

// Calculation modes (new)
export const CALCULATION_MODES = ['standard', 'solar', 'electrician'] as const
export type CalculationMode = (typeof CALCULATION_MODES)[number]

export const CALCULATION_MODE_LABELS: Record<CalculationMode, string> = {
  standard: 'Standard',
  solar: 'Solcelleanlæg',
  electrician: 'El-arbejde',
}

// Cost categories
export const COST_CATEGORIES = ['variable', 'fixed'] as const
export type CostCategory = (typeof COST_CATEGORIES)[number]

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  variable: 'Variabel',
  fixed: 'Fast',
}

// Calculation row types
export const CALCULATION_ROW_TYPES = ['manual', 'product', 'supplier_product', 'section'] as const
export type CalculationRowType = (typeof CALCULATION_ROW_TYPES)[number]

// Row type labels in Danish
export const CALCULATION_ROW_TYPE_LABELS: Record<CalculationRowType, string> = {
  manual: 'Manuel',
  product: 'Produkt',
  supplier_product: 'Leverandørprodukt',
  section: 'Sektion',
}

// Common sections with cost category defaults
export const CALCULATION_SECTIONS = [
  'Materialer',
  'Arbejdsløn',
  'Transport',
  'Andet',
] as const
export type CalculationSection = (typeof CALCULATION_SECTIONS)[number]

// Enhanced sections with more options and defaults
export const ENHANCED_SECTIONS = [
  { key: 'Materialer', label: 'Materialer', costCategory: 'variable' as CostCategory },
  { key: 'Arbejdsløn', label: 'Arbejdsløn', costCategory: 'variable' as CostCategory },
  { key: 'Transport', label: 'Transport', costCategory: 'variable' as CostCategory },
  { key: 'Udstyr', label: 'Udstyr/Leje', costCategory: 'variable' as CostCategory },
  { key: 'Overhead', label: 'Overhead', costCategory: 'fixed' as CostCategory },
  { key: 'Andet', label: 'Andet', costCategory: 'variable' as CostCategory },
] as const

// =====================================================
// Solar Calculation Settings
// =====================================================

export interface SolarCalculationSettings {
  systemSize?: number  // kWp
  panelCount?: number
  panelWattage?: number
  inverterType?: 'string' | 'micro' | 'hybrid'
  batteryCapacity?: number  // kWh
  roofType?: 'flat' | 'pitched' | 'integrated'
  annualProduction?: number  // kWh
  electricityPrice?: number  // DKK per kWh
  selfConsumptionRate?: number  // percentage
}

export interface SolarROIData {
  paybackYears?: number
  annualSavings?: number
  totalSavings25Years?: number
  co2Reduction?: number  // kg per year
  investmentReturn?: number  // percentage
}

// Enhanced ROI data (works for all project types)
export interface EnhancedROIData {
  investmentAmount: number
  paybackYears: number
  simpleROI: number

  // Solar-specific
  annualProduction?: number
  selfConsumptionRate?: number
  annualSavings?: number
  totalSavings25Years?: number
  co2Reduction?: number

  // General project
  estimatedAnnualBenefit?: number
  projectLifeYears?: number
}

// Financial summary for UI display
export interface FinancialSummary {
  materialsCost: number
  laborCost: number
  otherCosts: number
  totalCosts: number

  variableCosts: number
  fixedCosts: number

  subtotal: number
  contributionMargin: number
  contributionMarginRatio: number
  grossProfit: number
  grossProfitMargin: number

  marginAmount: number
  discountAmount: number
  taxAmount: number
  finalAmount: number
}

// =====================================================
// Calculation
// =====================================================

export interface Calculation {
  id: string
  name: string
  description: string | null
  customer_id: string | null
  calculation_type: CalculationType
  settings: SolarCalculationSettings | Record<string, unknown>
  subtotal: number
  margin_percentage: number
  margin_amount: number
  discount_percentage: number
  discount_amount: number
  tax_percentage: number
  tax_amount: number
  final_amount: number
  roi_data: SolarROIData | EnhancedROIData | null
  is_template: boolean
  created_by: string
  created_at: string
  updated_at: string

  // Enhanced calculation fields
  calculation_mode: CalculationMode
  total_materials_cost: number
  total_labor_cost: number
  total_other_costs: number
  total_variable_costs: number
  total_fixed_costs: number
  contribution_margin: number
  contribution_margin_ratio: number
  gross_profit: number
  gross_profit_margin: number
  default_hourly_rate: number
  materials_markup_percentage: number
  show_cost_breakdown: boolean
  group_by_section: boolean
}

export interface CalculationWithRelations extends Calculation {
  customer?: {
    id: string
    company_name: string
    customer_number: string
  } | null
  rows?: CalculationRowWithRelations[]
  created_by_profile?: {
    id: string
    full_name: string | null
    email: string
  } | null
}

export interface CreateCalculationInput {
  name: string
  description?: string | null
  customer_id?: string | null
  calculation_type?: CalculationType
  settings?: SolarCalculationSettings | Record<string, unknown>
  margin_percentage?: number
  discount_percentage?: number
  tax_percentage?: number
  is_template?: boolean

  // Enhanced calculation fields
  calculation_mode?: CalculationMode
  default_hourly_rate?: number
  materials_markup_percentage?: number
  show_cost_breakdown?: boolean
  group_by_section?: boolean
}

export interface UpdateCalculationInput extends Partial<CreateCalculationInput> {
  id: string
  roi_data?: SolarROIData | null
}

// =====================================================
// Calculation Row
// =====================================================

export interface CalculationRow {
  id: string
  calculation_id: string
  row_type: CalculationRowType
  product_id: string | null
  supplier_product_id: string | null
  section: string | null
  position: number
  description: string
  quantity: number
  unit: string
  cost_price: number | null
  sale_price: number
  margin_percentage: number
  discount_percentage: number
  total: number
  show_on_offer: boolean
  created_at: string
  updated_at: string

  // Enhanced calculation row fields
  cost_category: CostCategory
  hours: number | null
  hourly_rate: number | null
  profit_amount: number
}

export interface CalculationRowWithRelations extends CalculationRow {
  product?: (Product & { category?: ProductCategory | null }) | null
  supplier_product?: SupplierProduct | null
}

export interface CreateCalculationRowInput {
  calculation_id: string
  row_type?: CalculationRowType
  product_id?: string | null
  supplier_product_id?: string | null
  section?: string | null
  position: number
  description: string
  quantity?: number
  unit?: string
  cost_price?: number | null
  sale_price: number
  discount_percentage?: number
  show_on_offer?: boolean

  // Enhanced calculation row fields
  cost_category?: CostCategory
  hours?: number | null
  hourly_rate?: number | null
}

export interface UpdateCalculationRowInput extends Partial<Omit<CreateCalculationRowInput, 'calculation_id'>> {
  id: string
}

// =====================================================
// Filter types
// =====================================================

export interface CalculationFilters {
  search?: string
  customer_id?: string
  calculation_type?: CalculationType
  is_template?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}
