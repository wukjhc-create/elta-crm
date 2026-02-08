// =====================================================
// Products Types
// =====================================================

// Re-export supplier types for backward compatibility
import type { Supplier as _Supplier } from './suppliers.types'
export type { Supplier, SupplierFilters } from './suppliers.types'
export type { CreateSupplierData as CreateSupplierInput, UpdateSupplierData as UpdateSupplierInput } from './suppliers.types'
type Supplier = _Supplier

// Product units
export const PRODUCT_UNITS = [
  { value: 'stk', label: 'Stk.' },
  { value: 'time', label: 'Time' },
  { value: 'm', label: 'Meter' },
  { value: 'm2', label: 'm²' },
  { value: 'kWp', label: 'kWp' },
  { value: 'set', label: 'Sæt' },
  { value: 'pakke', label: 'Pakke' },
  { value: 'kg', label: 'Kg' },
  { value: 'l', label: 'Liter' },
] as const

export type ProductUnit = (typeof PRODUCT_UNITS)[number]['value']

// Product category slugs
export const PRODUCT_CATEGORY_SLUGS = [
  'panels',
  'inverters',
  'batteries',
  'mounting',
  'cables',
  'accessories',
  'labor',
] as const

export type ProductCategorySlug = (typeof PRODUCT_CATEGORY_SLUGS)[number]

// Category labels in Danish
export const PRODUCT_CATEGORY_LABELS: Record<ProductCategorySlug, string> = {
  panels: 'Solpaneler',
  inverters: 'Invertere',
  batteries: 'Batterier',
  mounting: 'Montering',
  cables: 'Kabler',
  accessories: 'Tilbehør',
  labor: 'Arbejdsløn',
}

// =====================================================
// Product Category
// =====================================================

export interface ProductCategory {
  id: string
  name: string
  slug: string
  parent_id: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface ProductCategoryWithChildren extends ProductCategory {
  children?: ProductCategory[]
}

export interface CreateProductCategoryInput {
  name: string
  slug: string
  parent_id?: string | null
  sort_order?: number
  is_active?: boolean
}

export interface UpdateProductCategoryInput extends Partial<CreateProductCategoryInput> {
  id: string
}

// =====================================================
// Product
// =====================================================

export interface ProductSpecifications {
  wattage?: number
  efficiency?: number
  dimensions?: string
  weight?: number
  warranty_years?: number
  [key: string]: string | number | boolean | undefined
}

export interface Product {
  id: string
  sku: string | null
  name: string
  description: string | null
  category_id: string | null
  cost_price: number | null
  list_price: number
  unit: string
  specifications: ProductSpecifications
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProductWithCategory extends Product {
  category?: ProductCategory | null
}

export interface CreateProductInput {
  sku?: string | null
  name: string
  description?: string | null
  category_id?: string | null
  cost_price?: number | null
  list_price: number
  unit?: string
  specifications?: ProductSpecifications
  is_active?: boolean
}

export interface UpdateProductInput extends Partial<CreateProductInput> {
  id: string
}

// =====================================================
// Supplier Product
// =====================================================

export interface SupplierProduct {
  id: string
  supplier_id: string
  product_id: string | null
  supplier_sku: string
  supplier_name: string
  cost_price: number | null
  is_available: boolean
  lead_time_days: number | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface SupplierProductWithRelations extends SupplierProduct {
  supplier?: Supplier | null
  product?: Product | null
}

export interface CreateSupplierProductInput {
  supplier_id: string
  product_id?: string | null
  supplier_sku: string
  supplier_name: string
  cost_price?: number | null
  is_available?: boolean
  lead_time_days?: number | null
}

export interface UpdateSupplierProductInput extends Partial<CreateSupplierProductInput> {
  id: string
}

// =====================================================
// Filter types
// =====================================================

export interface ProductFilters {
  search?: string
  category_id?: string
  is_active?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface SupplierProductFilters {
  supplier_id?: string
  is_available?: boolean
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}
