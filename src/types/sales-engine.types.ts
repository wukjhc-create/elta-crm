export interface SalesPackageRow {
  id: string
  slug: string
  name: string
  job_type: string
  description: string | null
  short_summary: string | null
  standard_text: string | null
  base_price: number
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface PackageOptionRow {
  id: string
  package_id: string
  name: string
  description: string | null
  offer_text: string | null
  price: number
  affects_materials: boolean
  material_id: string | null
  quantity_multiplier: number
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SalesTextBlockRow {
  id: string
  slug: string
  name: string
  content: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SalesPackageWithOptions extends SalesPackageRow {
  options: PackageOptionRow[]
}

export interface BuildOfferTextInput {
  packageId: string
  optionIds: string[]
  customerName?: string
  introBlockSlug?: string
  closingBlockSlug?: string
}

export interface OfferTextResult {
  intro: string
  packageDescription: string
  optionLines: string[]
  closing: string
  /** Full text joined with blank lines, ready to drop into offers.description. */
  full: string
}

export interface ApplyPackageWithOptionsInput {
  offerId: string
  packageId: string
  customerId: string | null
  optionIds: string[]
}

export interface ApplyPackageWithOptionsResult {
  packageId: string
  basePriceLineId: string | null
  materialLinesAdded: number
  materialLinesSkipped: number
  optionLinesAdded: number
  totalAdded: number
}
