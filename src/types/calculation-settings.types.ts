// =====================================================
// Calculation Settings Types
// =====================================================

// Setting categories
export const SETTING_CATEGORIES = [
  'hourly_rates',
  'margins',
  'work_hours',
  'defaults',
  'labor_types',
] as const
export type SettingCategory = (typeof SETTING_CATEGORIES)[number]

// Base setting interface
export interface CalculationSetting {
  id: string
  setting_key: string
  setting_value: Record<string, unknown>
  category: SettingCategory
  description: string | null
  updated_by: string | null
  updated_at: string
  created_at: string
}

// Specific setting types
export interface HourlyRateSetting {
  rate: number
  label: string
}

export interface MarginSetting {
  percentage: number
  label: string
}

export interface WorkHoursSetting {
  start?: string
  end?: string
  break_minutes?: number
  multiplier?: number
  label: string
}

export interface LaborType {
  code: string
  label: string
  rate_key: string
}

export interface LaborTypesSetting {
  types: LaborType[]
}

// All settings grouped
export interface CalculationSettings {
  hourly_rates: {
    electrician: number
    apprentice: number
    master: number
    helper: number
  }
  margins: {
    materials: number
    products: number
    subcontractor: number
    default_db_target: number
    minimum_db: number
  }
  work_hours: {
    start: string
    end: string
    break_minutes: number
    overtime_multiplier: number
    weekend_multiplier: number
  }
  defaults: {
    vat_percentage: number
    currency: string
    validity_days: number
    payment_terms_days: number
  }
  labor_types: LaborType[]
}

// Project templates
export interface ProjectTemplate {
  id: string
  name: string
  code: string | null
  description: string | null
  project_type: 'residential' | 'commercial' | 'industrial' | 'solar'
  default_rooms: RoomConfig[]
  settings_overrides: Record<string, unknown>
  is_active: boolean
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface RoomConfig {
  room_type: string
  count: number
  name: string
}

// Room types
export interface RoomType {
  id: string
  name: string
  code: string
  description: string | null
  icon: string | null
  default_components: RoomComponent[]
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface RoomComponent {
  component_code: string
  quantity: number
  variant?: string
}

// Calculation summary
export interface CalculationSummary {
  totalTimeMinutes: number
  totalTimeFormatted: string
  totalMaterialsCost: number
  totalLaborCost: number
  totalCostPrice: number
  totalSalePrice: number
  dbAmount: number
  dbPercentage: number
}

// Quick calculation input
export interface QuickCalculationInput {
  templateId?: string
  projectType: string
  rooms: QuickCalculationRoom[]
  settings?: Partial<CalculationSettings>
}

export interface QuickCalculationRoom {
  roomTypeCode: string
  name: string
  components: QuickCalculationComponent[]
}

export interface QuickCalculationComponent {
  componentCode: string
  variantCode?: string
  quantity: number
}
