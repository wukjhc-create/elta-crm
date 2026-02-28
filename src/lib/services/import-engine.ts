/**
 * Import Engine - Core logic for importing supplier product files
 * Supports CSV and XML formats with configurable column mappings
 */

import type {
  ImportConfig,
  ParsedRow,
  ValidatedRow,
  ImportResult,
  ImportError,
  PriceChange,
  ColumnMappings,
} from '@/types/suppliers.types'

// =====================================================
// Parser Functions
// =====================================================

/**
 * Parse Danish number format (1.234,56) to JavaScript number
 */
export function parseDanishNumber(value: string): number | null {
  if (!value || value.trim() === '') return null

  // Remove whitespace
  let cleaned = value.trim()

  // Handle Danish format: replace dots (thousands sep) and commas (decimal)
  // Check if the format looks Danish (has comma as decimal separator)
  if (cleaned.includes(',')) {
    // Remove thousand separators (dots before comma)
    cleaned = cleaned.replace(/\./g, '')
    // Replace comma with dot for decimal
    cleaned = cleaned.replace(',', '.')
  }

  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? null : parsed
}

/**
 * Parse a CSV line, handling quoted fields
 */
export function parseCSVLine(line: string, delimiter: string = ';'): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  // Add last field
  result.push(current.trim())

  return result
}

/**
 * Decode file content from various encodings
 */
export async function decodeFileContent(
  buffer: ArrayBuffer,
  encoding: string
): Promise<string> {
  // For browser environment, use TextDecoder
  try {
    const decoder = new TextDecoder(encoding.toLowerCase().replace('-', ''))
    return decoder.decode(buffer)
  } catch {
    // Fallback to UTF-8
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(buffer)
  }
}

// =====================================================
// Column Mapping Functions
// =====================================================

/**
 * Auto-detect column mappings from header row
 */
export function detectColumnMappings(
  headers: string[],
  knownMappings: ColumnMappings
): ColumnMappings {
  const detected: ColumnMappings = {}

  // Create reverse lookup from known mappings
  const reverseLookup: Record<string, string> = {}
  for (const [key, value] of Object.entries(knownMappings)) {
    if (typeof value === 'string') {
      reverseLookup[value.toLowerCase()] = key
    }
  }

  // Match headers to known column names
  headers.forEach((header, index) => {
    const normalizedHeader = header.toLowerCase().trim()

    // Check exact match first
    if (reverseLookup[normalizedHeader]) {
      detected[reverseLookup[normalizedHeader]] = index
      return
    }

    // Check partial matches
    for (const [knownName, fieldKey] of Object.entries(reverseLookup)) {
      if (
        normalizedHeader.includes(knownName) ||
        knownName.includes(normalizedHeader)
      ) {
        detected[fieldKey] = index
        return
      }
    }

    // Common field detection patterns
    if (normalizedHeader.includes('varenr') || normalizedHeader.includes('artikelnr') || normalizedHeader.includes('sku')) {
      detected.sku = index
    } else if (normalizedHeader.includes('beskriv') || normalizedHeader.includes('benævn') || normalizedHeader === 'navn' || normalizedHeader === 'name') {
      detected.name = index
    } else if (normalizedHeader.includes('indkøb') || normalizedHeader === 'nettopris' || normalizedHeader.includes('kostpris')) {
      detected.cost_price = index
    } else if (normalizedHeader === 'netto' && !detected.cost_price) {
      detected.cost_price = index
    } else if (normalizedHeader.includes('bruttopris') || normalizedHeader === 'brutto') {
      detected.gross_price = index
    } else if (normalizedHeader.includes('rabat') || normalizedHeader === 'discount' || normalizedHeader === 'rabat%') {
      detected.discount_pct = index
    } else if (normalizedHeader.includes('vejl') || normalizedHeader.includes('liste') || normalizedHeader.includes('udsalg')) {
      detected.list_price = index
    } else if (normalizedHeader === 'enhed' || normalizedHeader === 'unit') {
      detected.unit = index
    } else if (normalizedHeader.includes('varegruppe') || normalizedHeader.includes('hovedgruppe') || normalizedHeader.includes('kategori')) {
      detected.category = index
    } else if (normalizedHeader.includes('undergruppe') || normalizedHeader.includes('subkat')) {
      detected.sub_category = index
    } else if (normalizedHeader.includes('leverandør') || normalizedHeader.includes('fabrikant') || normalizedHeader.includes('manufacturer')) {
      detected.manufacturer = index
    } else if (normalizedHeader === 'ean' || normalizedHeader.includes('stregkode') || normalizedHeader.includes('barcode')) {
      detected.ean = index
    }
  })

  return detected
}

/**
 * Get value from row using column mapping
 */
export function getValueFromMapping(
  row: string[],
  mapping: string | number | undefined
): string {
  if (mapping === undefined) return ''

  if (typeof mapping === 'number') {
    return row[mapping] || ''
  }

  // If mapping is a string, it might be a column header name
  // In that case, we need the index - but since we normalize to indices, this shouldn't happen
  return ''
}

// =====================================================
// Validation Functions
// =====================================================

/**
 * Validate SKU format
 */
export function validateSku(sku: string): boolean {
  return sku.length > 0 && sku.length <= 100
}

/**
 * Validate product name
 */
export function validateName(name: string): boolean {
  return name.length > 0 && name.length <= 500
}

/**
 * Validate price
 */
export function validatePrice(price: number | null): boolean {
  if (price === null) return true // Null is valid (optional)
  return price >= 0 && price < 10000000 // Max 10 million
}

// =====================================================
// Import Engine Class
// =====================================================

export class ImportEngine {
  private config: ImportConfig

  constructor(config: ImportConfig) {
    this.config = config
  }

  /**
   * Parse CSV file content into rows
   */
  async parseCSV(content: string): Promise<ParsedRow[]> {
    const lines = content.split(/\r?\n/).filter((line) => line.trim())
    const delimiter = this.config.delimiter || ';'
    const skipRows = this.config.skip_header_rows || 0

    if (lines.length <= skipRows) {
      return []
    }

    // Get headers from first row (after skipped rows)
    const headers = parseCSVLine(lines[skipRows], delimiter)

    // Normalize column mappings to use indices
    const mappings = this.normalizeColumnMappings(headers)

    // Parse data rows
    const rows: ParsedRow[] = []

    for (let i = skipRows + 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim()) continue

      const values = parseCSVLine(line, delimiter)
      const parsed = this.parseRowValues(values, mappings)
      const errors = this.validateParsedRow(parsed)

      rows.push({
        rowNumber: i + 1,
        raw: this.createRawObject(headers, values),
        parsed,
        errors,
        warnings: [],
      })
    }

    return rows
  }

  /**
   * Normalize column mappings to use indices instead of names
   */
  private normalizeColumnMappings(headers: string[]): ColumnMappings {
    const normalized: ColumnMappings = {}
    const headerLower = headers.map((h) => h.toLowerCase().trim())

    for (const [key, value] of Object.entries(this.config.column_mappings)) {
      if (typeof value === 'number') {
        // Already an index
        normalized[key] = value
      } else if (typeof value === 'string') {
        // Find the index of this header
        const index = headerLower.indexOf(value.toLowerCase().trim())
        if (index >= 0) {
          normalized[key] = index
        }
      }
    }

    return normalized
  }

  /**
   * Parse row values using column mappings
   */
  private parseRowValues(
    values: string[],
    mappings: ColumnMappings
  ): ParsedRow['parsed'] {
    const getValue = (key: string): string => {
      const index = mappings[key]
      if (typeof index === 'number') {
        return values[index] || ''
      }
      return ''
    }

    const sku = getValue('sku').trim()
    const name = getValue('name').trim()
    const costPriceStr = getValue('cost_price')
    const listPriceStr = getValue('list_price')
    const grossPriceStr = getValue('gross_price')
    const discountPctStr = getValue('discount_pct')
    const unit = getValue('unit').trim() || 'stk'
    const category = getValue('category').trim() || undefined
    const subCategory = getValue('sub_category').trim() || undefined
    const manufacturer = getValue('manufacturer').trim() || undefined
    const ean = getValue('ean').trim() || undefined
    const minQtyStr = getValue('min_order_quantity')

    const grossPrice = parseDanishNumber(grossPriceStr)
    const discountPct = parseDanishNumber(discountPctStr)
    let costPrice = parseDanishNumber(costPriceStr)

    // If cost_price is missing but gross_price + discount are available, derive it
    if (costPrice === null && grossPrice !== null && grossPrice > 0 && discountPct !== null) {
      costPrice = Math.round(grossPrice * (1 - discountPct / 100) * 100) / 100
    }

    return {
      sku,
      name,
      cost_price: costPrice,
      list_price: parseDanishNumber(listPriceStr),
      gross_price: grossPrice,
      discount_pct: discountPct,
      unit,
      category,
      sub_category: subCategory,
      manufacturer,
      ean,
      min_order_quantity: minQtyStr ? parseInt(minQtyStr, 10) || 1 : undefined,
    }
  }

  /**
   * Create raw object from headers and values
   */
  private createRawObject(
    headers: string[],
    values: string[]
  ): Record<string, string> {
    const obj: Record<string, string> = {}
    headers.forEach((header, index) => {
      obj[header] = values[index] || ''
    })
    return obj
  }

  /**
   * Validate a parsed row and return errors
   */
  private validateParsedRow(parsed: ParsedRow['parsed']): string[] {
    const errors: string[] = []

    if (!validateSku(parsed.sku)) {
      errors.push('Ugyldigt varenummer')
    }

    if (!validateName(parsed.name)) {
      errors.push('Ugyldigt produktnavn')
    }

    if (!validatePrice(parsed.cost_price)) {
      errors.push('Ugyldig kostpris')
    }

    if (!validatePrice(parsed.list_price)) {
      errors.push('Ugyldig listepris')
    }

    return errors
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
   * Get column headers from file content
   */
  async getHeaders(content: string): Promise<string[]> {
    const lines = content.split(/\r?\n/).filter((line) => line.trim())
    const delimiter = this.config.delimiter || ';'
    const skipRows = this.config.skip_header_rows || 0

    if (lines.length <= skipRows) {
      return []
    }

    return parseCSVLine(lines[skipRows], delimiter)
  }
}

// =====================================================
// Helper Functions for Import Results
// =====================================================

export function createImportResult(
  batchId: string,
  rows: ValidatedRow[],
  priceChanges: PriceChange[],
  status: ImportResult['status']
): ImportResult {
  const validRows = rows.filter((r) => r.isValid)
  const newProducts = validRows.filter((r) => !r.isUpdate).length
  const updatedProducts = validRows.filter((r) => r.isUpdate).length
  const skippedRows = rows.length - validRows.length

  const errors: ImportError[] = rows
    .filter((r) => !r.isValid)
    .flatMap((r) =>
      r.errors.map((message) => ({
        row: r.rowNumber,
        message,
      }))
    )

  return {
    batch_id: batchId,
    total_rows: rows.length,
    new_products: newProducts,
    updated_products: updatedProducts,
    skipped_rows: skippedRows,
    errors,
    price_changes: priceChanges,
    status,
  }
}

export function calculatePriceChange(
  oldPrice: number | null,
  newPrice: number
): number {
  if (oldPrice === null || oldPrice === 0) return 0
  return ((newPrice - oldPrice) / oldPrice) * 100
}
