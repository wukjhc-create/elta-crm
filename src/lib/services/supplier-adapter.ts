/**
 * Supplier Adapter Framework
 *
 * Enterprise-grade adapter pattern for supplier integrations.
 * Each supplier (AO, Lemvigh-Müller, etc.) implements the SupplierAdapter interface
 * to provide consistent data transformation, import, and sync capabilities.
 */

import type {
  ImportConfig,
  ImportFormat,
  ParsedRow,
  ColumnMappings,
  ValidatedRow,
  ApiCredentials,
} from '@/types/suppliers.types'
import { ImportEngine, detectColumnMappings, parseDanishNumber } from './import-engine'

// =====================================================
// Adapter Interface
// =====================================================

export interface SupplierAdapterInfo {
  code: string
  name: string
  description: string
  website: string
  supportedFormats: ImportFormat[]
  features: string[]
  defaultEncoding: string
  defaultDelimiter: string
}

export interface SupplierAdapter {
  /** Adapter metadata */
  readonly info: SupplierAdapterInfo

  /** Get default import configuration */
  getDefaultConfig(): Omit<ImportConfig, 'supplier_id'>

  /** Get known column mappings for this supplier */
  getColumnMappings(): ColumnMappings

  /** Get category mapping table */
  getCategoryMap(): Record<string, string>

  /** Normalize a raw SKU to standard format */
  normalizeSku(rawSku: string): string

  /** Map supplier category to internal category */
  mapCategory(category: string, subCategory?: string): string

  /** Parse a price string in supplier's format */
  parsePrice(priceStr: string): number | null

  /** Transform a parsed row with supplier-specific logic */
  transformRow(row: ParsedRow): ParsedRow

  /** Parse file content into rows */
  parseFile(content: string, config?: Partial<ImportConfig>): Promise<ParsedRow[]>

  /** Auto-detect column mappings from headers */
  detectMappings(headers: string[]): ColumnMappings

  /** Validate a single parsed row */
  validateRow(row: ParsedRow): string[]

  /** Whether this adapter supports API-based sync */
  supportsApiSync(): boolean

  /** Whether this adapter supports FTP-based sync */
  supportsFtpSync(): boolean

  /** Validate API/FTP credentials (optional) */
  validateCredentials?(credentials: ApiCredentials): Promise<boolean>
}

// =====================================================
// Base Adapter Implementation
// =====================================================

export abstract class BaseSupplierAdapter implements SupplierAdapter {
  abstract readonly info: SupplierAdapterInfo
  abstract getColumnMappings(): ColumnMappings
  abstract getCategoryMap(): Record<string, string>
  abstract normalizeSku(rawSku: string): string

  getDefaultConfig(): Omit<ImportConfig, 'supplier_id'> {
    return {
      format: this.info.supportedFormats[0] || 'csv',
      delimiter: this.info.defaultDelimiter,
      encoding: this.info.defaultEncoding,
      column_mappings: this.getColumnMappings(),
      skip_header_rows: 0,
      has_header: true,
    }
  }

  mapCategory(category: string, subCategory?: string): string {
    if (!category) return 'Andet'

    const map = this.getCategoryMap()

    // Exact match
    if (map[category]) return map[category]

    // Partial match on main category
    for (const [key, value] of Object.entries(map)) {
      if (category.toLowerCase().includes(key.toLowerCase())) {
        return value
      }
    }

    // Try subcategory if provided
    if (subCategory) {
      for (const [key, value] of Object.entries(map)) {
        if (subCategory.toLowerCase().includes(key.toLowerCase())) {
          return value
        }
      }
    }

    return category
  }

  parsePrice(priceStr: string): number | null {
    return parseDanishNumber(priceStr)
  }

  transformRow(row: ParsedRow): ParsedRow {
    return {
      ...row,
      parsed: {
        ...row.parsed,
        sku: this.normalizeSku(row.parsed.sku),
        category: row.parsed.category
          ? this.mapCategory(row.parsed.category, row.parsed.sub_category)
          : undefined,
      },
    }
  }

  async parseFile(content: string, configOverrides?: Partial<ImportConfig>): Promise<ParsedRow[]> {
    const defaultConfig = this.getDefaultConfig()
    const config: ImportConfig = {
      supplier_id: '', // Will be set by caller
      ...defaultConfig,
      ...configOverrides,
      column_mappings: {
        ...defaultConfig.column_mappings,
        ...configOverrides?.column_mappings,
      },
    }

    const engine = new ImportEngine(config)
    const rows = await engine.parseCSV(content)

    // Apply supplier-specific transformations
    return rows.map((row) => this.transformRow(row))
  }

  detectMappings(headers: string[]): ColumnMappings {
    return detectColumnMappings(headers, this.getColumnMappings())
  }

  validateRow(row: ParsedRow): string[] {
    const errors: string[] = []

    if (!row.parsed.sku || row.parsed.sku.trim() === '') {
      errors.push('Manglende varenummer (SKU)')
    }

    if (!row.parsed.name || row.parsed.name.trim() === '') {
      errors.push('Manglende produktnavn')
    }

    if (row.parsed.cost_price !== null && row.parsed.cost_price < 0) {
      errors.push('Negativ kostpris')
    }

    if (row.parsed.list_price !== null && row.parsed.list_price < 0) {
      errors.push('Negativ listepris')
    }

    return errors
  }

  supportsApiSync(): boolean {
    return false
  }

  supportsFtpSync(): boolean {
    return false
  }
}

// =====================================================
// Adapter Registry
// =====================================================

type AdapterFactory = () => SupplierAdapter

class SupplierAdapterRegistryClass {
  private adapters = new Map<string, AdapterFactory>()

  register(code: string, factory: AdapterFactory): void {
    this.adapters.set(code.toUpperCase(), factory)
  }

  get(code: string): SupplierAdapter | null {
    const factory = this.adapters.get(code.toUpperCase())
    return factory ? factory() : null
  }

  getAll(): SupplierAdapter[] {
    return Array.from(this.adapters.values()).map((f) => f())
  }

  getAllInfo(): SupplierAdapterInfo[] {
    return this.getAll().map((a) => a.info)
  }

  has(code: string): boolean {
    return this.adapters.has(code.toUpperCase())
  }

  getCodes(): string[] {
    return Array.from(this.adapters.keys())
  }
}

// Singleton registry
export const SupplierAdapterRegistry = new SupplierAdapterRegistryClass()
