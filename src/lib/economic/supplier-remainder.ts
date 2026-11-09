/**
 * Open creditor remainders from booked e-conomic entries.
 * The amount used is `remainder` in the entry currency. `amount` is the original
 * total and `remainderInBaseCurrency` is a conversion, so neither is a remainder.
 * A missing figure makes the whole read unknown. It is not skipped as 0.
 */
import { forecastBucket, type ForecastId } from '@/lib/finance/position'
import { roundMoney } from '@/lib/utils/money-round'

export const CREDITOR_ENTRY_TYPES = ['supplierInvoice', 'supplierPayment', 'openingEntry', 'transferredOpeningEntry'] as const
export type CreditorEntryType = (typeof CREDITOR_ENTRY_TYPES)[number]

export interface CreditorEntry {
  entryNumber: number
  year: string
  entryType: CreditorEntryType
  supplierNumber: number
  supplierInvoiceNumber: string | null
  currency: string
  /** Signed. A supplier invoice remainder is negative while it is unpaid. */
  remainder: number
  dueDate: string | null
}

export type ClassifiedRow = { kind: 'item'; item: Omit<CreditorEntry, 'year'> } | { kind: 'ignore' } | { kind: 'unreadable' }

const ENTRY_TYPES = new Set<string>(CREDITOR_ENTRY_TYPES)

function isIsoCurrency(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value)
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/**
 * One booked entry. A contra line has no supplier and no remainder, so it is ignored.
 * Money without a supplier, or a supplier without a numeric remainder, cannot be summed.
 */
export function classifyCreditorRow(row: unknown): ClassifiedRow {
  if (!row || typeof row !== 'object') return { kind: 'unreadable' }
  const record = row as {
    entryNumber?: unknown
    entryType?: unknown
    currency?: unknown
    dueDate?: unknown
    remainder?: unknown
    supplierInvoiceNumber?: unknown
    supplier?: { supplierNumber?: unknown } | null
  }
  if (typeof record.entryType !== 'string' || !ENTRY_TYPES.has(record.entryType)) return { kind: 'ignore' }
  const supplierNumber = record.supplier?.supplierNumber
  const hasSupplier = typeof supplierNumber === 'number' && Number.isSafeInteger(supplierNumber) && supplierNumber > 0
  const remainder = typeof record.remainder === 'number' && Number.isFinite(record.remainder) ? record.remainder : null
  if (!hasSupplier && remainder == null) return { kind: 'ignore' }
  if (!hasSupplier || remainder == null) return { kind: 'unreadable' }
  if (remainder === 0) return { kind: 'ignore' }
  if (!isIsoCurrency(record.currency)) return { kind: 'unreadable' }
  if (record.dueDate != null && !isDate(record.dueDate)) return { kind: 'unreadable' }
  if (typeof record.entryNumber !== 'number' || !Number.isSafeInteger(record.entryNumber) || record.entryNumber <= 0) return { kind: 'unreadable' }
  let invoiceNumber: string | null = null
  if (typeof record.supplierInvoiceNumber === 'string') invoiceNumber = record.supplierInvoiceNumber.trim() || null
  else if (record.supplierInvoiceNumber != null) return { kind: 'unreadable' }
  return {
    kind: 'item',
    item: {
      entryNumber: record.entryNumber,
      entryType: record.entryType as CreditorEntryType,
      supplierNumber,
      supplierInvoiceNumber: invoiceNumber,
      currency: record.currency,
      remainder,
      dueDate: record.dueDate ?? null,
    },
  }
}

export interface CurrencyRemainder {
  currency: string
  /** Signed sum of remainders. Negative means the company still owes the supplier. */
  remainder: number
}

export interface CreditorHorizons {
  overdue: number
  d30: number
  d60: number
  d90: number
  later: number
  undated: number
}

export interface KnownCreditors {
  state: 'known'
  /** True when every open remainder is DKK. A foreign remainder is not converted. */
  dkkOnly: boolean
  /**
   * Positive amount still to pay in DKK, including undated rows. Null when another currency is open,
   * because a DKK-only total would hide that currency.
   */
  dkkToPay: number | null
  overdueToPay: number | null
  horizon30ToPay: number | null
  horizon60ToPay: number | null
  horizon90ToPay: number | null
  unscheduledToPay: number | null
  currencies: CurrencyRemainder[]
  items: CreditorEntry[]
}

export type CreditorRead =
  | { state: 'not_read' }
  | { state: 'error' }
  | { state: 'unknown' }
  | KnownCreditors

/** Pages that did not finish, or a row that cannot be read, are unknown. An empty finished set is a real empty set. */
export function aggregateCreditorRemainders(input: {
  complete: boolean
  today: string
  rows: Array<{ year: string; row: unknown }>
}): CreditorRead {
  if (!input.complete) return { state: 'unknown' }
  const items: CreditorEntry[] = []
  const seen = new Set<string>()
  for (const wrapped of input.rows) {
    if (!/^[0-9]{4}$/.test(wrapped.year)) return { state: 'unknown' }
    const classified = classifyCreditorRow(wrapped.row)
    if (classified.kind === 'unreadable') return { state: 'unknown' }
    if (classified.kind === 'ignore') continue
    const key = `${wrapped.year}:${classified.item.entryNumber}`
    if (seen.has(key)) return { state: 'unknown' }
    seen.add(key)
    items.push({ ...classified.item, year: wrapped.year })
  }
  const byCurrency = new Map<string, number>()
  const dkkWindows: Record<ForecastId, number> = { overdue: 0, d30: 0, d60: 0, d90: 0, later: 0, undated: 0 }
  let foreign = false
  for (const item of items) {
    byCurrency.set(item.currency, roundMoney((byCurrency.get(item.currency) ?? 0) + item.remainder))
    if (item.currency !== 'DKK') {
      foreign = true
      continue
    }
    const bucket = forecastBucket(item.dueDate, input.today)
    dkkWindows[bucket] = roundMoney(dkkWindows[bucket] + item.remainder)
  }
  const currencies = Array.from(byCurrency, ([currency, remainder]) => ({ currency, remainder }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
  const toPay = (remainder: number) => roundMoney(-remainder)
  const through = (ids: ForecastId[]) => toPay(ids.reduce((sum, id) => roundMoney(sum + dkkWindows[id]), 0))
  return {
    state: 'known',
    dkkOnly: !foreign,
    dkkToPay: foreign ? null : toPay(Array.from(byCurrency.values()).reduce((sum, value) => roundMoney(sum + value), 0)),
    overdueToPay: foreign ? null : toPay(dkkWindows.overdue),
    horizon30ToPay: foreign ? null : through(['overdue', 'd30']),
    horizon60ToPay: foreign ? null : through(['overdue', 'd30', 'd60']),
    horizon90ToPay: foreign ? null : through(['overdue', 'd30', 'd60', 'd90']),
    unscheduledToPay: foreign ? null : toPay(dkkWindows.undated),
    currencies,
    items,
  }
}

export interface SupplierLink {
  id: string
  name: string | null
  externalSupplierId: string | null
  externalProvider: string | null
}

export interface InvoiceLink {
  id: string
  supplierId: string | null
  externalInvoiceId: string | null
  externalProvider: string | null
}

export type MatchState = { state: 'matched'; supplierId: string; name: string } | { state: 'unmatched' } | { state: 'ambiguous' } | { state: 'unknown' }

/** Exact e-conomic supplier number only. Two rows with the same number are ambiguous. Names are not used. */
export function matchSupplier(supplierNumber: number, links: SupplierLink[] | null): MatchState {
  if (links == null) return { state: 'unknown' }
  const wanted = String(supplierNumber)
  const hits = links.filter((link) => link.externalProvider === 'economic' && (link.externalSupplierId ?? '').trim() === wanted)
  if (hits.length === 0) return { state: 'unmatched' }
  if (hits.length > 1) return { state: 'ambiguous' }
  return { state: 'matched', supplierId: hits[0].id, name: hits[0].name?.trim() || `Leverandør ${wanted}` }
}

/** An invoice number matches only the one incoming invoice on the already matched supplier. */
export function matchIncomingInvoice(item: CreditorEntry, supplier: MatchState, invoices: InvoiceLink[] | null): string | null {
  if (supplier.state !== 'matched' || invoices == null || !item.supplierInvoiceNumber) return null
  const hits = invoices.filter((row) => row.externalProvider === 'economic' && row.supplierId === supplier.supplierId && (row.externalInvoiceId ?? '').trim() === item.supplierInvoiceNumber)
  return hits.length === 1 ? hits[0].id : null
}
