// =====================================================
// Package System Types
// =====================================================

// Package item types
export const PACKAGE_ITEM_TYPES = ['component', 'product', 'manual', 'time'] as const
export type PackageItemType = (typeof PACKAGE_ITEM_TYPES)[number]

export const PACKAGE_ITEM_TYPE_LABELS: Record<PackageItemType, string> = {
  component: 'Komponent',
  product: 'Produkt',
  manual: 'Manuel',
  time: 'Tid',
}

// Package category
export interface PackageCategory {
  id: string
  name: string
  slug: string
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

// Package
export interface Package {
  id: string
  name: string
  code: string | null
  description: string | null
  category_id: string | null

  // Auto-calculated totals
  total_cost_price: number
  total_sale_price: number
  db_amount: number
  db_percentage: number
  total_time_minutes: number

  // Settings
  default_markup_percentage: number
  is_active: boolean
  is_template: boolean

  // Metadata
  created_by: string | null
  created_at: string
  updated_at: string

  // Relations
  category?: PackageCategory
  items?: PackageItem[]
}

// Package summary (from view)
export interface PackageSummary {
  id: string
  code: string | null
  name: string
  description: string | null
  category_name: string | null
  total_cost_price: number
  total_sale_price: number
  db_amount: number
  db_percentage: number
  total_time_minutes: number
  is_active: boolean
  is_template: boolean
  item_count: number
  component_count: number
  product_count: number
  manual_count: number
  time_count: number
  created_at: string
  updated_at: string
}

// Package item
export interface PackageItem {
  id: string
  package_id: string
  item_type: PackageItemType

  // References
  component_id: string | null
  component_variant_code: string | null
  product_id: string | null

  // Item details
  description: string
  quantity: number
  unit: string

  // Pricing
  cost_price: number
  sale_price: number

  // Time (minutes)
  time_minutes: number

  // Calculated
  total_cost: number
  total_sale: number
  total_time: number

  // Display
  sort_order: number
  show_on_offer: boolean
  notes: string | null

  created_at: string
  updated_at: string

  // Relations (when joined)
  component?: {
    id: string
    code: string
    name: string
    base_time_minutes: number
  }
  product?: {
    id: string
    sku: string | null
    name: string
    cost_price: number | null
    list_price: number
  }
}

// Create/Update inputs
export interface CreatePackageInput {
  name: string
  code?: string
  description?: string
  category_id?: string
  default_markup_percentage?: number
  is_active?: boolean
  is_template?: boolean
}

export interface UpdatePackageInput extends Partial<CreatePackageInput> {
  id: string
}

export interface CreatePackageItemInput {
  package_id: string
  item_type: PackageItemType
  component_id?: string
  component_variant_code?: string
  product_id?: string
  description: string
  quantity: number
  unit?: string
  cost_price?: number
  sale_price?: number
  time_minutes?: number
  sort_order?: number
  show_on_offer?: boolean
  notes?: string
}

export interface UpdatePackageItemInput extends Partial<Omit<CreatePackageItemInput, 'package_id'>> {
  id: string
}

// Financial summary for display
export interface PackageFinancialSummary {
  totalCost: number
  totalSale: number
  dbAmount: number
  dbPercentage: number
  totalTimeMinutes: number
  totalTimeFormatted: string // "2t 30m"

  // Breakdown
  componentsCost: number
  componentsSale: number
  productsCost: number
  productsSale: number
  manualCost: number
  manualSale: number
  laborCost: number
  laborSale: number
}
