/**
 * Types for Supplier/Wholesaler Integration
 * Supports AO, Lemvigh-Müller and other Danish electrical wholesalers
 */

// =====================================================
// Core Supplier Types
// =====================================================

export interface Supplier {
  id: string
  name: string
  code: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  website: string | null
  notes: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateSupplierData {
  name: string
  code?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  website?: string
  notes?: string
  is_active?: boolean
}

export interface UpdateSupplierData extends Partial<CreateSupplierData> {
  id: string
}

// =====================================================
// Supplier Settings Types
// =====================================================

export type ImportFormat = 'csv' | 'xml' | 'api'

export interface ColumnMappings {
  sku?: string | number
  name?: string | number
  cost_price?: string | number
  list_price?: string | number
  unit?: string | number
  category?: string | number
  sub_category?: string | number
  manufacturer?: string | number
  ean?: string | number
  min_order_quantity?: string | number
  [key: string]: string | number | undefined
}

export interface ApiCredentials {
  username?: string
  password?: string
  api_key?: string
}

export interface FtpCredentials {
  username?: string
  password?: string
  port?: number
}

export interface SupplierSettings {
  id: string
  supplier_id: string
  import_format: ImportFormat | null
  csv_delimiter: string
  csv_encoding: string
  column_mappings: ColumnMappings
  api_base_url: string | null
  api_credentials: ApiCredentials | null
  ftp_host: string | null
  ftp_credentials: FtpCredentials | null
  default_margin_percentage: number
  auto_update_prices: boolean
  is_preferred: boolean
  last_import_at: string | null
  created_at: string
  updated_at: string
}

export interface UpdateSupplierSettingsData {
  import_format?: ImportFormat
  csv_delimiter?: string
  csv_encoding?: string
  column_mappings?: ColumnMappings
  api_base_url?: string
  api_credentials?: ApiCredentials
  ftp_host?: string
  ftp_credentials?: FtpCredentials
  default_margin_percentage?: number
  auto_update_prices?: boolean
  is_preferred?: boolean
}

// =====================================================
// Supplier Product Types
// =====================================================

export interface SupplierProduct {
  id: string
  supplier_id: string
  product_id: string | null
  supplier_sku: string
  supplier_name: string
  cost_price: number | null
  list_price: number | null
  margin_percentage: number | null
  calculated_sale_price: number | null
  min_order_quantity: number
  unit: string
  category: string | null
  sub_category: string | null
  manufacturer: string | null
  ean: string | null
  specifications: Record<string, unknown>
  is_available: boolean
  lead_time_days: number | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface SupplierProductWithSupplier extends SupplierProduct {
  supplier_name: string
  supplier_code: string | null
  supplier_is_active: boolean
  default_margin_percentage: number | null
  is_preferred: boolean
  effective_sale_price: number
}

export interface UpdateSupplierProductData {
  id: string
  product_id?: string | null
  cost_price?: number
  list_price?: number
  margin_percentage?: number
  min_order_quantity?: number
  unit?: string
  category?: string
  sub_category?: string
  manufacturer?: string
  is_available?: boolean
  lead_time_days?: number
}

// =====================================================
// Price History Types
// =====================================================

export type ChangeSource = 'import' | 'manual' | 'api_sync'

export interface PriceHistory {
  id: string
  supplier_product_id: string
  old_cost_price: number | null
  new_cost_price: number | null
  old_list_price: number | null
  new_list_price: number | null
  change_percentage: number | null
  change_source: ChangeSource
  import_batch_id: string | null
  created_at: string
}

// =====================================================
// Import Types
// =====================================================

export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dry_run'

export interface ImportBatch {
  id: string
  supplier_id: string
  filename: string | null
  file_size_bytes: number | null
  total_rows: number | null
  processed_rows: number
  new_products: number
  updated_products: number
  skipped_rows: number
  errors: ImportError[]
  status: ImportStatus
  is_dry_run: boolean
  started_at: string | null
  completed_at: string | null
  created_by: string | null
  created_at: string
}

export interface ImportBatchSummary extends ImportBatch {
  supplier_name: string
  supplier_code: string | null
  created_by_name: string | null
  created_by_email: string | null
}

export interface ImportError {
  row: number
  column?: string
  message: string
  value?: string
}

export interface ImportConfig {
  supplier_id: string
  format: ImportFormat
  delimiter?: string
  encoding?: string
  column_mappings: ColumnMappings
  skip_header_rows?: number
  has_header?: boolean
}

export interface ParsedRow {
  rowNumber: number
  raw: Record<string, string>
  parsed: {
    sku: string
    name: string
    cost_price: number | null
    list_price: number | null
    unit?: string
    category?: string
    sub_category?: string
    manufacturer?: string
    ean?: string
    min_order_quantity?: number
  }
  errors: string[]
  warnings: string[]
}

export interface ValidatedRow extends ParsedRow {
  isValid: boolean
  existingProductId?: string
  isUpdate: boolean
}

export interface ImportPreview {
  totalRows: number
  validRows: number
  invalidRows: number
  newProducts: number
  updatedProducts: number
  skippedRows: number
  sampleRows: ValidatedRow[]
  errors: ImportError[]
  warnings: string[]
  columnHeaders: string[]
  detectedMappings: ColumnMappings
}

export interface ImportResult {
  batch_id: string
  total_rows: number
  new_products: number
  updated_products: number
  skipped_rows: number
  errors: ImportError[]
  price_changes: PriceChange[]
  status: ImportStatus
}

export interface PriceChange {
  supplier_product_id: string
  supplier_sku: string
  product_name: string
  old_cost_price: number | null
  new_cost_price: number
  old_list_price: number | null
  new_list_price: number | null
  change_percentage: number
}

// =====================================================
// AO Specific Types
// =====================================================

export const AO_COLUMN_MAPPINGS: ColumnMappings = {
  sku: 'Varenummer',
  name: 'Beskrivelse',
  cost_price: 'Indkøbspris',
  list_price: 'Vejl. udsalgspris',
  unit: 'Enhed',
  category: 'Varegruppe',
  ean: 'EAN',
  manufacturer: 'Leverandør',
}

export const AO_IMPORT_CONFIG: Omit<ImportConfig, 'supplier_id'> = {
  format: 'csv',
  delimiter: ';',
  encoding: 'iso-8859-1',
  column_mappings: AO_COLUMN_MAPPINGS,
  skip_header_rows: 1,
  has_header: true,
}

// =====================================================
// Lemvigh-Müller Specific Types
// =====================================================

export const LM_COLUMN_MAPPINGS: ColumnMappings = {
  sku: 'Artikelnr',
  name: 'Artikelbenævnelse',
  cost_price: 'Nettopris',
  list_price: 'Listepris',
  unit: 'Enhed',
  category: 'Hovedgruppe',
  sub_category: 'Undergruppe',
}

export const LM_IMPORT_CONFIG: Omit<ImportConfig, 'supplier_id'> = {
  format: 'csv',
  delimiter: ';',
  encoding: 'utf-8',
  column_mappings: LM_COLUMN_MAPPINGS,
  skip_header_rows: 1,
  has_header: true,
}

// =====================================================
// Filter and Query Types
// =====================================================

export interface SupplierFilters {
  search?: string
  is_active?: boolean
  sortBy?: 'name' | 'code' | 'created_at'
  sortOrder?: 'asc' | 'desc'
}

export interface SupplierProductFilters {
  supplier_id?: string
  search?: string
  category?: string
  is_available?: boolean
  has_product_link?: boolean
  sortBy?: 'supplier_sku' | 'supplier_name' | 'cost_price' | 'category' | 'updated_at'
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface ImportBatchFilters {
  supplier_id?: string
  status?: ImportStatus
  is_dry_run?: boolean
  sortBy?: 'created_at' | 'filename' | 'status'
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

// =====================================================
// Sync Job Types
// =====================================================

export type SyncJobType = 'full_catalog' | 'price_update' | 'availability_check' | 'custom'
export type SyncTriggerType = 'manual' | 'scheduled' | 'webhook' | 'api'
export type SyncLogStatus = 'started' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface SupplierSyncJob {
  id: string
  supplier_id: string
  job_type: SyncJobType
  name: string
  description: string | null
  schedule_cron: string | null
  is_active: boolean
  last_run_at: string | null
  next_run_at: string | null
  last_status: 'success' | 'failed' | 'partial' | null
  retry_count: number
  max_retries: number
  config: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SupplierSyncJobWithSupplier extends SupplierSyncJob {
  supplier_name: string
  supplier_code: string | null
  supplier_is_active: boolean
  total_runs: number
  last_run_started_at: string | null
  last_run_status: SyncLogStatus | null
}

export interface CreateSyncJobData {
  supplier_id: string
  job_type: SyncJobType
  name: string
  description?: string
  schedule_cron?: string
  is_active?: boolean
  max_retries?: number
  config?: Record<string, unknown>
}

export interface UpdateSyncJobData {
  name?: string
  description?: string
  schedule_cron?: string
  is_active?: boolean
  max_retries?: number
  config?: Record<string, unknown>
}

export interface SupplierSyncLog {
  id: string
  sync_job_id: string | null
  supplier_id: string
  job_type: string
  status: SyncLogStatus
  trigger_type: SyncTriggerType | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  total_items: number
  processed_items: number
  new_items: number
  updated_items: number
  failed_items: number
  skipped_items: number
  price_changes_count: number
  error_message: string | null
  error_stack: string | null
  details: Record<string, unknown>
  import_batch_id: string | null
  triggered_by: string | null
  created_at: string
}

export interface SyncLogFilters {
  supplier_id?: string
  sync_job_id?: string
  status?: SyncLogStatus
  job_type?: SyncJobType
  sortBy?: 'started_at' | 'status' | 'job_type'
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

// =====================================================
// Customer-Specific Pricing Types
// =====================================================

export interface CustomerSupplierPrice {
  id: string
  customer_id: string
  supplier_id: string
  discount_percentage: number
  custom_margin_percentage: number | null
  price_list_code: string | null
  notes: string | null
  valid_from: string | null
  valid_to: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateCustomerSupplierPriceData {
  customer_id: string
  supplier_id: string
  discount_percentage?: number
  custom_margin_percentage?: number
  price_list_code?: string
  notes?: string
  valid_from?: string
  valid_to?: string
  is_active?: boolean
}

export interface CustomerProductPrice {
  id: string
  customer_id: string
  supplier_product_id: string
  custom_cost_price: number | null
  custom_list_price: number | null
  custom_discount_percentage: number | null
  notes: string | null
  valid_from: string | null
  valid_to: string | null
  is_active: boolean
  source: 'manual' | 'import' | 'api'
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CustomerEffectivePrice {
  effective_cost_price: number
  effective_list_price: number | null
  discount_percentage: number
  margin_percentage: number
  effective_sale_price: number
  price_source: 'standard' | 'customer_product' | 'customer_supplier'
}

// =====================================================
// Kalkia Integration Types
// =====================================================

export interface MaterialSupplierLink {
  material_id: string
  supplier_product_id: string
  auto_update_price: boolean
}

export interface SupplierOptionForMaterial {
  supplier_product_id: string
  supplier_id: string
  supplier_name: string
  supplier_code: string | null
  supplier_sku: string
  product_name: string
  cost_price: number
  list_price: number | null
  effective_sale_price?: number
  discount_percentage?: number
  is_preferred: boolean
  is_available: boolean
}

export interface MaterialPriceFromSupplier {
  material_id: string
  supplier_product_id: string
  supplier_name: string
  supplier_sku: string
  base_cost_price: number
  effective_cost_price: number
  effective_sale_price: number
  discount_percentage: number
  margin_percentage: number
  price_source: string
  is_stale: boolean
  last_synced_at: string | null
}
