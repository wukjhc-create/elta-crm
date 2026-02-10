import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { da } from 'date-fns/locale'

// =====================================================
// Date Formatting
// =====================================================

/**
 * Format date with time in Danish locale: "15. feb 2026 14:30"
 */
export function formatDateTimeDK(date: string | Date | null | undefined): string {
  if (!date) return ''
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return format(dateObj, 'd. MMM yyyy HH:mm', { locale: da })
}

/**
 * Format date with long month in Danish: "15. februar 2026"
 */
export function formatDateLongDK(date: string | Date | null | undefined): string {
  if (!date) return ''
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return format(dateObj, 'd. MMMM yyyy', { locale: da })
}

/**
 * Format relative time in Danish: "2 timer siden"
 */
export function formatTimeAgo(date: string | Date | null | undefined): string {
  if (!date) return ''
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  return formatDistanceToNow(dateObj, { addSuffix: true, locale: da })
}

/**
 * Format duration from milliseconds to human-readable: "2m 30s"
 */
export function formatDurationMs(ms: number | null | undefined): string {
  if (!ms) return '\u2014'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

/**
 * Smart date format: relative for recent dates (< 7 days), absolute for older.
 * "2 timer siden" / "15. feb 2026"
 */
export function formatSmartDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  const now = new Date()
  const diffMs = now.getTime() - dateObj.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  if (diffDays >= 0 && diffDays < 7) {
    return formatDistanceToNow(dateObj, { addSuffix: true, locale: da })
  }
  return format(dateObj, 'd. MMM yyyy', { locale: da })
}

// =====================================================
// Number/Currency Formatting
// =====================================================

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

/**
 * Format number as Danish currency (DKK)
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format number with Danish locale (thousand separators)
 */
export function formatNumber(num: number, decimals: number = 0): string {
  return new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('da-DK', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100)
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Capitalize first letter
 */
export function capitalize(text: string): string {
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

/**
 * Generate initials from name
 */
export function getInitials(name: string, maxLength: number = 2): string {
  if (!name) return ''
  return name
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, maxLength)
    .join('')
}
