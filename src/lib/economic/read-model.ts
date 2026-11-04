/**
 * Pure e-conomic read shapes. No HTTP and no secrets.
 * A missing balance is unknown. A real 0 is kept.
 */

export function economicReadPathAllowed(path: string): boolean {
  if (!path.startsWith('/') || path.includes('?') || path.includes('..') || path.includes('//')) return false
  return [
    /^\/self$/,
    /^\/accounting-years$/,
    /^\/accounting-years\/\d{4}\/(entries|periods|totals)$/,
    /^\/accounts$/,
    /^\/accounts\/\d+$/,
    /^\/customers$/,
    /^\/suppliers$/,
    /^\/invoices\/booked$/,
  ].some((rule) => rule.test(path))
}

export type KnownAmount = { state: 'known'; amount: number } | { state: 'unknown' }

/** Current balance on one account. 0 is a real balance. Anything else is unknown. */
export function parseAccountBalance(data: unknown): KnownAmount {
  if (!data || typeof data !== 'object') return { state: 'unknown' }
  const balance = (data as { balance?: unknown }).balance
  if (typeof balance !== 'number' || !Number.isFinite(balance)) return { state: 'unknown' }
  return { state: 'known', amount: balance }
}

export interface ParsedCollection {
  rows: unknown[]
  /** False when another page exists or the page is full. A full page must not be summed as the company total. */
  complete: boolean
}

/** Null when the body is not a collection. An empty collection is complete and has no rows. */
export function parseCollection(data: unknown, pagesize: number): ParsedCollection | null {
  if (!data || typeof data !== 'object' || !('collection' in data)) return null
  const collection = (data as { collection?: unknown }).collection
  if (!Array.isArray(collection)) return null
  const next = (data as { pagination?: { nextPage?: unknown } }).pagination?.nextPage
  const hasNext = next != null && next !== ''
  return {
    rows: collection,
    complete: !hasNext && collection.length < pagesize,
  }
}

export interface BookedRemainder {
  bookedInvoiceNumber: number
  currency: string | null
  /** Null when e-conomic did not send a finite remainder. Never coerced to 0. */
  remainder: number | null
  dueDate: string | null
}

export function parseBookedRemainder(row: unknown): BookedRemainder | null {
  if (!row || typeof row !== 'object') return null
  const number = (row as { bookedInvoiceNumber?: unknown }).bookedInvoiceNumber
  if (typeof number !== 'number' || !Number.isInteger(number)) return null
  const rawRemainder = (row as { remainder?: unknown }).remainder
  const remainder = typeof rawRemainder === 'number' && Number.isFinite(rawRemainder) ? rawRemainder : null
  const currency = (row as { currency?: unknown }).currency
  const due = (row as { dueDate?: unknown }).dueDate
  return {
    bookedInvoiceNumber: number,
    currency: typeof currency === 'string' && currency.trim() ? currency : null,
    remainder,
    dueDate: typeof due === 'string' && /^\d{4}-\d{2}-\d{2}/.test(due) ? due.slice(0, 10) : null,
  }
}
