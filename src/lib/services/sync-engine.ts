/**
 * Supplier Sync Engine
 *
 * Orchestrates supplier data synchronization with:
 * - Adapter-based file processing
 * - Price change tracking and history
 * - Sync job execution with logging
 * - Batch operations with progress tracking
 */

import type {
  ImportConfig,
  ParsedRow,
  ValidatedRow,
  PriceChange,
  ImportResult,
  ImportError,
  ColumnMappings,
} from '@/types/suppliers.types'
import type { SupplierAdapter } from './supplier-adapter'
import { SupplierAdapterRegistry } from './supplier-adapter'
import { ImportEngine, calculatePriceChange } from './import-engine'

// =====================================================
// Sync Engine Types
// =====================================================

export interface SyncContext {
  supplierId: string
  supplierCode: string | null
  userId: string
  batchId?: string
  dryRun: boolean
  triggerType: 'manual' | 'scheduled' | 'webhook' | 'api'
}

export interface SyncResult {
  batchId: string
  logId: string
  totalItems: number
  processedItems: number
  newItems: number
  updatedItems: number
  failedItems: number
  skippedItems: number
  priceChanges: PriceChange[]
  errors: ImportError[]
  status: 'completed' | 'failed' | 'dry_run'
  durationMs: number
}

export interface ProcessedProduct {
  sku: string
  name: string
  costPrice: number | null
  listPrice: number | null
  unit: string
  category?: string
  subCategory?: string
  manufacturer?: string
  ean?: string
  minOrderQuantity?: number
  isNew: boolean
  isUpdated: boolean
  priceChange?: PriceChange
  errors: string[]
}

// =====================================================
// Sync Engine
// =====================================================

export class SyncEngine {
  private adapter: SupplierAdapter | null = null

  /**
   * Get adapter for a supplier code
   */
  getAdapter(supplierCode: string | null): SupplierAdapter | null {
    if (!supplierCode) return null
    if (!this.adapter || this.adapter.info.code !== supplierCode.toUpperCase()) {
      this.adapter = SupplierAdapterRegistry.get(supplierCode)
    }
    return this.adapter
  }

  /**
   * Process file content through adapter
   */
  async processFile(
    content: string,
    supplierCode: string | null,
    configOverrides?: Partial<ImportConfig>
  ): Promise<ParsedRow[]> {
    const adapter = this.getAdapter(supplierCode)

    if (adapter) {
      return adapter.parseFile(content, configOverrides)
    }

    // Fallback: use generic import engine
    const config: ImportConfig = {
      supplier_id: '',
      format: 'csv',
      delimiter: configOverrides?.delimiter || ';',
      encoding: configOverrides?.encoding || 'utf-8',
      column_mappings: configOverrides?.column_mappings || {},
      skip_header_rows: 0,
      has_header: true,
      ...configOverrides,
    }

    const engine = new ImportEngine(config)
    return engine.parseCSV(content)
  }

  /**
   * Detect column mappings from headers
   */
  detectMappings(
    headers: string[],
    supplierCode: string | null
  ): ColumnMappings {
    const adapter = this.getAdapter(supplierCode)
    if (adapter) {
      return adapter.detectMappings(headers)
    }
    return {}
  }

  /**
   * Validate rows against existing products
   */
  async validateRows(
    rows: ParsedRow[],
    existingProducts: Map<string, string>
  ): Promise<ValidatedRow[]> {
    return rows.map((row) => {
      const existingProductId = existingProducts.get(row.parsed.sku)
      const isValid = row.errors.length === 0

      return {
        ...row,
        isValid,
        existingProductId,
        isUpdate: !!existingProductId,
      }
    })
  }

  /**
   * Calculate price changes between old and new data
   */
  calculatePriceChanges(
    validatedRows: ValidatedRow[],
    existingPrices: Map<string, { cost: number | null; list: number | null }>
  ): PriceChange[] {
    const changes: PriceChange[] = []

    for (const row of validatedRows) {
      if (!row.isUpdate || row.parsed.cost_price === null) continue

      const existing = existingPrices.get(row.parsed.sku)
      if (!existing) continue

      const oldPrice = existing.cost
      const newPrice = row.parsed.cost_price

      if (oldPrice !== null && oldPrice !== newPrice) {
        changes.push({
          supplier_product_id: row.existingProductId || '',
          supplier_sku: row.parsed.sku,
          product_name: row.parsed.name,
          old_cost_price: oldPrice,
          new_cost_price: newPrice,
          old_list_price: existing.list,
          new_list_price: row.parsed.list_price,
          change_percentage: calculatePriceChange(oldPrice, newPrice),
        })
      }
    }

    return changes
  }

  /**
   * Get adapter info for UI display
   */
  getAdapterInfo(supplierCode: string | null): {
    name: string
    features: string[]
    supportedFormats: string[]
  } | null {
    if (!supplierCode) return null
    const adapter = this.getAdapter(supplierCode)
    if (!adapter) return null

    return {
      name: adapter.info.name,
      features: adapter.info.features,
      supportedFormats: adapter.info.supportedFormats,
    }
  }

  /**
   * Get all registered adapter codes
   */
  getRegisteredAdapters(): string[] {
    return SupplierAdapterRegistry.getCodes()
  }
}

// Singleton export
export const syncEngine = new SyncEngine()
