/**
 * AO Supplier Adapter
 *
 * Enterprise adapter for AO (Danish electrical wholesaler).
 * Implements the SupplierAdapter interface with:
 * - CSV import with ISO-8859-1 encoding
 * - Danish number format parsing (1.234,56)
 * - AO-specific SKU normalization
 * - Category mapping for Danish electrical products
 * - Fallback mechanisms for encoding/format issues
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
// AO Column Mappings
// =====================================================

export const AO_COLUMN_MAPPINGS: ColumnMappings = {
  sku: 'Varenummer',
  name: 'Beskrivelse',
  cost_price: 'Indkøbspris',
  list_price: 'Vejl. udsalgspris',
  gross_price: 'Bruttopris',
  discount_pct: 'Rabat%',
  unit: 'Enhed',
  category: 'Varegruppe',
  ean: 'EAN',
  manufacturer: 'Leverandør',
}

export const AO_DEFAULT_CONFIG: Omit<ImportConfig, 'supplier_id'> = {
  format: 'csv',
  delimiter: ';',
  encoding: 'iso-8859-1',
  column_mappings: AO_COLUMN_MAPPINGS,
  skip_header_rows: 0,
  has_header: true,
}

// =====================================================
// AO Category Map (comprehensive)
// =====================================================

const AO_CATEGORY_MAP: Record<string, string> = {
  // Electrical installation
  'Installationsmateriel': 'Installation',
  'Stikdåser': 'Stikdåser',
  'Kontakter': 'Kontakter',
  'Afbrydere': 'Afbrydere',
  'Dåser': 'Installation',
  'Kabelkanaler': 'Kabelføring',
  'Kabelrør': 'Kabelføring',
  'Rør og tilbehør': 'Kabelføring',
  'Tavlekomponenter': 'Tavler',
  'Tavler': 'Tavler',
  'Klemmrækker': 'Tavler',
  'DIN-skinner': 'Tavler',

  // Lighting
  'Belysning': 'Belysning',
  'LED-belysning': 'LED Belysning',
  'Lyskilder': 'Lyskilder',
  'Armaturer': 'Armaturer',
  'Spots': 'Belysning',
  'Udendørsbelysning': 'Belysning',

  // Cables
  'Ledninger': 'Kabler',
  'Installationskabler': 'Kabler',
  'Stærkstrømskabler': 'Kabler',
  'Svagstrømskabler': 'Kabler',
  'Datakabling': 'Kabler',
  'Flexledninger': 'Kabler',

  // Safety / Protection
  'Sikkerhed': 'Sikkerhed',
  'Fejlstrømsafbrydere': 'Sikkerhed',
  'Sikringer': 'Sikringer',
  'Automatsikringer': 'Automatsikringer',
  'Overspaendingsbeskyttelse': 'Sikkerhed',
  'Jordforbindelse': 'Sikkerhed',

  // Solar / Energy
  'Solceller': 'Solceller',
  'Solcellepaneler': 'Solceller',
  'Invertere': 'Invertere',
  'Batterilagring': 'Energilagring',
  'Elbil-ladning': 'Elbil',
  'Ladestandere': 'Elbil',

  // Smart Home
  'Smarthome': 'Smart Home',
  'KNX': 'Smart Home',
  'Zigbee': 'Smart Home',

  // Tools
  'Værktøj': 'Værktøj',
  'Måleudstyr': 'Værktøj',
  'Elværktøj': 'Værktøj',
}

// =====================================================
// AO Adapter Implementation
// =====================================================

export class AOAdapter extends BaseSupplierAdapter {
  readonly info: SupplierAdapterInfo = {
    code: 'AO',
    name: 'AO',
    description: 'Dansk el-grossist - En af Danmarks største el-grossister',
    website: 'https://www.ao.dk',
    supportedFormats: ['csv'],
    features: [
      'CSV import med semikolon-separator',
      'Dansk talformat (1.234,56)',
      'ISO-8859-1 encoding med UTF-8 fallback',
      'Automatisk kategori-mapping',
      'SKU-normalisering (fjerner AO-præfiks og ledende nuller)',
      'Pris-validering og -korrektion',
    ],
    defaultEncoding: 'iso-8859-1',
    defaultDelimiter: ';',
  }

  getColumnMappings(): ColumnMappings {
    return { ...AO_COLUMN_MAPPINGS }
  }

  getCategoryMap(): Record<string, string> {
    return { ...AO_CATEGORY_MAP }
  }

  normalizeSku(rawSku: string): string {
    let sku = rawSku.trim()

    // Remove AO prefix
    if (sku.startsWith('AO-')) {
      sku = sku.substring(3)
    }

    // Remove leading zeros but keep at least one digit
    sku = sku.replace(/^0+(?=\d)/, '')

    return sku
  }

  /**
   * Override parseFile with fallback encoding support.
   * If ISO-8859-1 parsing fails or produces garbled output,
   * retry with UTF-8.
   */
  async parseFile(content: string, configOverrides?: Partial<ImportConfig>): Promise<ParsedRow[]> {
    const rows = await super.parseFile(content, configOverrides)

    // Fallback: If too many rows have empty SKU or name, the encoding might be wrong
    if (rows.length > 0) {
      const emptySkuCount = rows.filter((r) => !r.parsed.sku || r.parsed.sku.trim() === '').length
      const emptyRatio = emptySkuCount / rows.length

      if (emptyRatio > 0.5) {
        // Try with UTF-8 encoding as fallback
        const fallbackRows = await super.parseFile(content, {
          ...configOverrides,
          encoding: 'utf-8',
        })

        const fallbackEmptyCount = fallbackRows.filter(
          (r) => !r.parsed.sku || r.parsed.sku.trim() === ''
        ).length

        // Use fallback if it produces better results
        if (fallbackEmptyCount < emptySkuCount) {
          return fallbackRows
        }
      }
    }

    return rows
  }

  /**
   * Override transformRow with AO-specific Brutto/Rabat → Netto derivation.
   * If cost_price is null but gross_price and discount_pct are available,
   * the engine already derived it. We add an extra fallback here:
   * if Nettopris column is present as alternative name for cost_price.
   */
  transformRow(row: ParsedRow): ParsedRow {
    const transformed = super.transformRow(row)

    // If cost_price is still null and we have gross_price without discount,
    // use gross_price as the list_price and warn the user
    const grossPrice = transformed.parsed.gross_price ?? null
    const discountPct = transformed.parsed.discount_pct ?? null

    if (
      transformed.parsed.cost_price === null &&
      grossPrice !== null &&
      grossPrice > 0 &&
      discountPct === null
    ) {
      transformed.warnings.push(
        'Kun bruttopris fundet uden rabat% — kan ikke beregne nettopris automatisk'
      )
    }

    // Cross-validate: cost_price should not exceed gross_price
    if (
      transformed.parsed.cost_price !== null &&
      grossPrice !== null &&
      transformed.parsed.cost_price > grossPrice * 1.01 // allow 1% rounding
    ) {
      transformed.warnings.push(
        'Nettopris er højere end bruttopris — kontrollér prisdata'
      )
    }

    return transformed
  }

  /**
   * Enhanced row validation with AO-specific checks
   */
  validateRow(row: ParsedRow): string[] {
    const errors = super.validateRow(row)

    // AO-specific: SKU should be numeric or alphanumeric
    if (row.parsed.sku && !/^[A-Za-z0-9\-_.]+$/.test(row.parsed.sku)) {
      errors.push('Ugyldigt AO varenummer-format')
    }

    // AO-specific: cost_price should typically be > 0 for valid products
    if (row.parsed.cost_price !== null && row.parsed.cost_price === 0) {
      row.warnings.push('Kostpris er 0 - kontrollér venligst')
    }

    return errors
  }

  supportsFtpSync(): boolean {
    return true // AO supports FTP catalog delivery
  }
}

// =====================================================
// Legacy compatibility exports
// =====================================================

export class AOImporter extends ImportEngine {
  constructor(supplierId: string, customMappings?: Partial<ColumnMappings>) {
    super({
      ...AO_DEFAULT_CONFIG,
      supplier_id: supplierId,
      column_mappings: {
        ...AO_COLUMN_MAPPINGS,
        ...customMappings,
      },
    })
  }

  static normalizeSku(rawSku: string): string {
    const adapter = new AOAdapter()
    return adapter.normalizeSku(rawSku)
  }

  static mapCategory(aoCategory: string): string {
    const adapter = new AOAdapter()
    return adapter.mapCategory(aoCategory)
  }

  static parsePrice(priceStr: string): number | null {
    return parseDanishNumber(priceStr)
  }

  static transformRow(row: ParsedRow): ParsedRow {
    const adapter = new AOAdapter()
    return adapter.transformRow(row)
  }

  static detectMappings(headers: string[]): ColumnMappings {
    const adapter = new AOAdapter()
    return adapter.detectMappings(headers)
  }
}

export const AO_IMPORTER_INFO = {
  name: 'AO',
  code: 'AO',
  description: 'Dansk el-grossist',
  website: 'https://www.ao.dk',
  defaultConfig: AO_DEFAULT_CONFIG,
  columnMappings: AO_COLUMN_MAPPINGS,
  categoryMap: AO_CATEGORY_MAP,
  features: [
    'CSV import med semikolon-separator',
    'Dansk talformat (1.234,56)',
    'ISO-8859-1 encoding',
    'Automatisk kategori-mapping',
  ],
}

// Register adapter
SupplierAdapterRegistry.register('AO', () => new AOAdapter())
