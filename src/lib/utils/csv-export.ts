/**
 * CSV Export Utility
 *
 * Generates CSV files with proper Danish formatting:
 * - Semicolon delimiter (standard in DK for Excel compatibility)
 * - UTF-8 BOM for correct character encoding in Excel
 * - Danish number formatting preserved as strings
 */

interface CsvColumn<T> {
  header: string
  accessor: (row: T) => string | number | boolean | null | undefined
}

/**
 * Generate CSV string from data with typed column definitions
 */
export function generateCsv<T>(
  data: T[],
  columns: CsvColumn<T>[],
): string {
  const BOM = '\uFEFF' // UTF-8 BOM for Excel
  const DELIMITER = ';'
  const NEWLINE = '\r\n'

  // Header row
  const header = columns.map((col) => escapeCsvField(col.header)).join(DELIMITER)

  // Data rows
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = col.accessor(row)
        if (value === null || value === undefined) return ''
        return escapeCsvField(String(value))
      })
      .join(DELIMITER),
  )

  return BOM + header + NEWLINE + rows.join(NEWLINE)
}

/**
 * Escape a CSV field value - wrap in quotes if it contains special characters
 */
function escapeCsvField(value: string): string {
  if (
    value.includes(';') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Trigger browser download of CSV content
 */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Format a date for CSV export (Danish format)
 */
export function csvDate(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('da-DK', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/**
 * Format a datetime for CSV export (Danish format)
 */
export function csvDateTime(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('da-DK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format currency for CSV (Danish format with kr.)
 */
export function csvCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return ''
  return amount.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Format boolean for CSV (Danish)
 */
export function csvBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  return value ? 'Ja' : 'Nej'
}
