// =====================================================
// Quick Jobs Types - Phase B
// =====================================================

export interface QuickJobComponent {
  component_code: string
  variant_code: string | null
  quantity: number
  notes?: string
}

export interface QuickJob {
  id: string
  code: string
  name: string
  description: string | null
  category: string
  icon: string

  // Pre-configured components
  components: QuickJobComponent[]

  // Estimates
  estimated_time_minutes: number
  estimated_cost_price: number
  estimated_sale_price: number

  // Default settings
  default_building_profile_code: string | null

  // Display
  is_featured: boolean
  usage_count: number
  sort_order: number

  // Status
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CalibrationPreset {
  id: string
  code: string
  name: string
  description: string | null

  // Factor overrides
  factor_overrides: Record<string, number>

  // Settings
  default_building_profile_id: string | null
  hourly_rate: number | null
  margin_percentage: number | null

  // Metadata
  category: string
  is_default: boolean
  is_active: boolean

  created_by: string | null
  created_at: string
  updated_at: string
}

// Category definitions for UI
export const QUICK_JOB_CATEGORIES = {
  residential: { label: 'Bolig', icon: 'Home' },
  renovation: { label: 'Renovering', icon: 'Hammer' },
  'kitchen-bath': { label: 'Køkken & Bad', icon: 'ChefHat' },
  outdoor: { label: 'Udendørs', icon: 'Sun' },
  panel: { label: 'Tavle', icon: 'LayoutGrid' },
  service: { label: 'Service', icon: 'Wrench' },
  general: { label: 'Generelt', icon: 'Zap' },
} as const

export type QuickJobCategory = keyof typeof QUICK_JOB_CATEGORIES

export const CALIBRATION_CATEGORIES = {
  standard: { label: 'Standard', color: 'blue' },
  budget: { label: 'Budget', color: 'green' },
  premium: { label: 'Premium', color: 'purple' },
  special: { label: 'Special', color: 'orange' },
  'project-type': { label: 'Projekttype', color: 'gray' },
  custom: { label: 'Brugerdefineret', color: 'slate' },
} as const

export type CalibrationCategory = keyof typeof CALIBRATION_CATEGORIES
