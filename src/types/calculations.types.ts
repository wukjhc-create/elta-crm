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

// Common sections
export const CALCULATION_SECTIONS = [
  'Materialer',
  'Arbejdsløn',
  'Transport',
  'Andet',
] as const
export type CalculationSection = (typeof CALCULATION_SECTIONS)[number]

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
  roi_data: SolarROIData | null
  is_template: boolean
  created_by: string
  created_at: string
  updated_at: string
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
