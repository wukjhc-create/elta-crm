/**
 * Lemvigh-Müller Supplier Adapter
 *
 * Enterprise adapter for Lemvigh-Müller (Danish electrical wholesaler & technical trading).
 * Implements the SupplierAdapter interface with:
 * - CSV import with UTF-8 encoding
 * - Danish number format parsing (1.234,56)
 * - L-M specific SKU normalization
 * - Category + subcategory mapping
 * - Customer-specific pricing support via price list codes
 * - Deep Kalkia material integration
 */

import { BaseSupplierAdapter, SupplierAdapterRegistry } from '../supplier-adapter'
import type { SupplierAdapterInfo } from '../supplier-adapter'
import { parseDanishNumber } from '../import-engine'
import type {
  ColumnMappings,
  ParsedRow,
  ImportConfig,
} from '@/types/suppliers.types'
import { ImportEngine } from '../import-engine'

// =====================================================
// L-M Column Mappings
// =====================================================

export const LM_COLUMN_MAPPINGS: ColumnMappings = {
  sku: 'Artikelnr',
  name: 'Artikelbenævnelse',
  cost_price: 'Nettopris',
  list_price: 'Listepris',
  unit: 'Enhed',
  category: 'Hovedgruppe',
  sub_category: 'Undergruppe',
  manufacturer: 'Leverandør',
  ean: 'EAN',
}

export const LM_DEFAULT_CONFIG: Omit<ImportConfig, 'supplier_id'> = {
  format: 'csv',
  delimiter: ';',
  encoding: 'utf-8',
  column_mappings: LM_COLUMN_MAPPINGS,
  skip_header_rows: 0,
  has_header: true,
}

// =====================================================
// L-M Category Map (comprehensive with subcategories)
// =====================================================

const LM_CATEGORY_MAP: Record<string, string> = {
  // Electrical Installation
  'El-installation': 'Installation',
  'Installationsmateriel': 'Installation',
  'El-artikler': 'El-artikler',
  'Stikdåser og kontakter': 'Installation',
  'Dåser og bøsninger': 'Installation',
  'Kabelkanaler': 'Kabelføring',
  'Kabelrør': 'Kabelføring',
  'Kabelstiger': 'Kabelføring',
  'Tavler og komponenter': 'Tavler',

  // Lighting
  'Belysning': 'Belysning',
  'Lyskilder': 'Lyskilder',
  'LED': 'LED Belysning',
  'Armaturer': 'Armaturer',
  'Nødbelysning': 'Belysning',

  // Cables
  'Kabler': 'Kabler',
  'Ledninger': 'Kabler',
  'Installationsledning': 'Kabler',
  'Datakabler': 'Kabler',
  'Fiberoptik': 'Kabler',

  // Safety / Protection
  'Sikringer': 'Sikringer',
  'Automater': 'Automatsikringer',
  'HPFI': 'Sikkerhed',
  'Fejlstrøm': 'Sikkerhed',
  'Overspaendingsbeskyttelse': 'Sikkerhed',
  'Jordforbindelse': 'Sikkerhed',

  // Industrial
  'Industri': 'Industri',
  'Automation': 'Automation',
  'Styringsudstyr': 'Automation',
  'Frekvensomformere': 'Automation',
  'PLC': 'Automation',
  'Motorer': 'Industri',

  // Solar / Energy
  'Sol og energi': 'Solceller',
  'Solceller': 'Solceller',
  'Inverter': 'Invertere',
  'Batterier': 'Energilagring',
  'Elbil-ladestandere': 'Elbil',

  // VVS (L-M speciality)
  'VVS': 'VVS',
  'Rør': 'VVS',
  'Pumper': 'VVS',
  'Ventilation': 'VVS',
  'Varme': 'VVS',
  'Varmepumper': 'Varmepumper',

  // Smart Home
  'Smarthome': 'Smart Home',
  'KNX': 'Smart Home',

  // Tools
  'Værktøj': 'Værktøj',
  'Håndværktøj': 'Værktøj',
  'El-værktøj': 'Værktøj',
  'Måleudstyr': 'Værktøj',
  'Sikkerhedsudstyr': 'Personlig sikkerhed',
}

// =====================================================
// L-M Adapter Implementation
// =====================================================

export class LMAdapter extends BaseSupplierAdapter {
  readonly info: SupplierAdapterInfo = {
    code: 'LM',
    name: 'Lemvigh-Müller',
    description: 'Dansk el-grossist og teknisk handel - Bredeste sortiment i Danmark',
    website: 'https://www.lfrm.dk',
    supportedFormats: ['csv', 'xml'],
    features: [
      'CSV import med semikolon-separator',
      'Dansk talformat (1.234,56)',
      'UTF-8 encoding',
      'Hovedgruppe og undergruppe-mapping',
      'Automatisk kategori-mapping',
      'SKU-normalisering',
      'Kundespecifik prisliste-support',
      'Bred produktdækning (el, VVS, industri)',
    ],
    defaultEncoding: 'utf-8',
    defaultDelimiter: ';',
  }

  getColumnMappings(): ColumnMappings {
    return { ...LM_COLUMN_MAPPINGS }
  }

  getCategoryMap(): Record<string, string> {
    return { ...LM_CATEGORY_MAP }
  }

  normalizeSku(rawSku: string): string {
    // Remove whitespace
    let sku = rawSku.trim().replace(/\s+/g, '')

    // Remove L-M prefixes
    if (sku.startsWith('LM-') || sku.startsWith('LM_')) {
      sku = sku.substring(3)
    }

    return sku
  }

  /**
   * Enhanced category mapping with subcategory support.
   * L-M has a Hovedgruppe/Undergruppe hierarchy that provides
   * more precise categorization.
   */
  mapCategory(category: string, subCategory?: string): string {
    if (!category) return 'Andet'

    const map = this.getCategoryMap()

    // Try combined "Category > SubCategory" match first
    if (subCategory) {
      const combined = `${category} > ${subCategory}`
      if (map[combined]) return map[combined]
    }

    // Exact match on main category
    if (map[category]) return map[category]

    // Partial match on main category
    for (const [key, value] of Object.entries(map)) {
      if (category.toLowerCase().includes(key.toLowerCase())) {
        return value
      }
    }

    // Try subcategory
    if (subCategory) {
      if (map[subCategory]) return map[subCategory]

      for (const [key, value] of Object.entries(map)) {
        if (subCategory.toLowerCase().includes(key.toLowerCase())) {
          return value
        }
      }
    }

    return category
  }

  /**
   * Enhanced validation for L-M products.
   * L-M articles have specific format requirements.
   */
  validateRow(row: ParsedRow): string[] {
    const errors = super.validateRow(row)

    // L-M specific: article numbers are typically numeric
    if (row.parsed.sku && row.parsed.sku.length > 20) {
      errors.push('Artikelnummer er for langt (max 20 tegn)')
    }

    return errors
  }

  supportsApiSync(): boolean {
    return true // L-M provides API access for larger customers
  }

  supportsFtpSync(): boolean {
    return true // L-M supports FTP-based price list delivery
  }
}

// =====================================================
// Legacy compatibility exports
// =====================================================

export class LMImporter extends ImportEngine {
  constructor(supplierId: string, customMappings?: Partial<ColumnMappings>) {
    super({
      ...LM_DEFAULT_CONFIG,
      supplier_id: supplierId,
      column_mappings: {
        ...LM_COLUMN_MAPPINGS,
        ...customMappings,
      },
    })
  }

  static normalizeSku(rawSku: string): string {
    const adapter = new LMAdapter()
    return adapter.normalizeSku(rawSku)
  }

  static mapCategory(lmCategory: string, subCategory?: string): string {
    const adapter = new LMAdapter()
    return adapter.mapCategory(lmCategory, subCategory)
  }

  static parsePrice(priceStr: string): number | null {
    return parseDanishNumber(priceStr)
  }

  static transformRow(row: ParsedRow): ParsedRow {
    const adapter = new LMAdapter()
    return adapter.transformRow(row)
  }

  static detectMappings(headers: string[]): ColumnMappings {
    const adapter = new LMAdapter()
    return adapter.detectMappings(headers)
  }
}

export const LM_IMPORTER_INFO = {
  name: 'Lemvigh-Müller',
  code: 'LM',
  description: 'Dansk el-grossist og teknisk handel',
  website: 'https://www.lfrm.dk',
  defaultConfig: LM_DEFAULT_CONFIG,
  columnMappings: LM_COLUMN_MAPPINGS,
  categoryMap: LM_CATEGORY_MAP,
  features: [
    'CSV import med semikolon-separator',
    'Dansk talformat (1.234,56)',
    'UTF-8 encoding',
    'Hovedgruppe og undergruppe support',
    'Automatisk kategori-mapping',
  ],
}

// Register adapter
SupplierAdapterRegistry.register('LM', () => new LMAdapter())
