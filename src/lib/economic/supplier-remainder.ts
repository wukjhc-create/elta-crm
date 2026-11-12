/**
 * Open creditor remainders from booked e-conomic entries.
 * The amount used is `remainder` in the entry currency. `amount` is the original
 * total and `remainderInBaseCurrency` is a conversion, so neither is a remainder.
 * A missing figure makes the whole read unknown. It is not skipped as 0.
 *
 * Completeness (Claude review 2026-11-12): the official entryType enum has ten values
 * (restapi.e-conomic.com/schema/accounting-years.accountingYear.entries.get.schema.json), and nothing in the
 * documentation ties a supplier remainder to a particular type. The reader therefore does NOT filter on entryType:
 * it reads every entry with a non-zero remainder and attributes it only by the entry's own `supplier` / `customer`
 * reference. A non-zero remainder that names neither (or both) cannot be attributed, so the whole read is unknown,
 * and an open supplier item can never be dropped silently because of its type.
 */
import { forecastBucket, type ForecastId } from '@/lib/finance/position'
import { roundMoney } from '@/lib/utils/money-round'

/** Filter for every open item of every entry type. Attribution happens per row, never by type. */
export const OPEN_ITEM_FILTER = 'remainder$ne:0'
/** Types that carry a balance into a year. Together with open items in an earlier year they may be the same debt twice. */
const OPENING_TYPES = new Set(['openingEntry', 'transferredOpeningEntry'])
/** Documented customer-side types. One of these with a supplier reference cannot be attributed safely. */
const CUSTOMER_TYPES = new Set(['customerInvoice', 'customerPayment', 'reminder', 'manualDebtorInvoice'])

export interface CreditorEntry {
  entryNumber: number
  year: string
  /** Any documented or future entry type. Not used to decide what is a supplier remainder. */
  entryType: string
  supplierNumber: number
  supplierInvoiceNumber: string | null
  currency: string
  /** Signed. A supplier invoice remainder is negative while it is unpaid. */
  remainder: number
  dueDate: string | null
}

export type ClassifiedRow = { kind: 'item'; item: Omit<CreditorEntry, 'year'> } | { kind: 'ignore' } | { kind: 'unreadable' }

function isIsoCurrency(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value)
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/**
 * One booked entry, of any type. A contra line has no party and no remainder, so it is ignored.
 * A customer open item is a receivable and ignored here. A supplier without a numeric remainder, or a non-zero
 * remainder that names no party (or both), cannot be attributed: the whole read becomes unknown.
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
    customer?: { customerNumber?: unknown } | null
  }
  const supplierNumber = record.supplier?.supplierNumber
  const hasSupplier = positiveNumber(supplierNumber)
  const hasCustomer = positiveNumber(record.customer?.customerNumber)
  // A supplier object without a usable number is not an attribution; it is unreadable
  if (record.supplier != null && !hasSupplier) return { kind: 'unreadable' }
  const remainder = typeof record.remainder === 'number' && Number.isFinite(record.remainder) ? record.remainder : null
  if (remainder == null) {
    // Matched and contra lines come back with remainder null. A non-numeric value, or a supplier line without a
    // remainder, is unreadable.
    if (record.remainder != null) return { kind: 'unreadable' }
    return hasSupplier ? { kind: 'unreadable' } : { kind: 'ignore' }
  }
  if (remainder === 0) return { kind: 'ignore' }
  if (hasSupplier && hasCustomer) return { kind: 'unreadable' }
  if (!hasSupplier) return hasCustomer ? { kind: 'ignore' } : { kind: 'unreadable' }
  if (typeof record.entryType !== 'string' || !record.entryType) return { kind: 'unreadable' }
  // A customer-side type that names a supplier is contradictory: neither counting nor skipping it is provably right
  if (CUSTOMER_TYPES.has(record.entryType)) return { kind: 'unreadable' }
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
      entryType: record.entryType,
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
  /**
   * Why the 30/60/90 to-pay figures are null although the total is known: DKK still owed with no due date cannot be
   * placed in a horizon, so leaving it out would overstate projected cash.
   */
  horizonBlocked: 'undated_owed' | null
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
  const supplierYears = new Map<number, string[]>()
  const openingYears = new Map<number, string[]>()
  for (const wrapped of input.rows) {
    if (!/^[0-9]{4}$/.test(wrapped.year)) return { state: 'unknown' }
    const classified = classifyCreditorRow(wrapped.row)
    if (classified.kind === 'unreadable') return { state: 'unknown' }
    if (classified.kind === 'ignore') continue
    const key = `${wrapped.year}:${classified.item.entryNumber}`
    if (seen.has(key)) return { state: 'unknown' }
    seen.add(key)
    items.push({ ...classified.item, year: wrapped.year })
    const sn = classified.item.supplierNumber
    supplierYears.set(sn, [...(supplierYears.get(sn) ?? []), wrapped.year])
    if (OPENING_TYPES.has(classified.item.entryType)) openingYears.set(sn, [...(openingYears.get(sn) ?? []), wrapped.year])
  }
  // The documentation does not say whether an entry in an earlier year keeps its remainder after its balance has been
  // carried into a later year. An opening balance for a supplier next to that supplier's open items in an earlier year
  // may therefore be the same debt twice. That cannot be resolved from the entries, so the sum is unknown.
  for (const [sn, opening] of openingYears) {
    const firstOpening = opening.reduce((min, y) => (y < min ? y : min))
    if ((supplierYears.get(sn) ?? []).some((y) => y < firstOpening)) return { state: 'unknown' }
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
  // Outflow in a horizon is never negative: a supplier credit or an unmatched payment offsets later invoices, it is
  // not money coming in. Floored at 0 so projected cash cannot rise because of a credit.
  const through = (ids: ForecastId[]) => Math.max(0, toPay(ids.reduce((sum, id) => roundMoney(sum + dkkWindows[id]), 0)))
  const undatedOwed = !foreign && dkkWindows.undated < 0
  const horizon = (ids: ForecastId[]) => (foreign || undatedOwed ? null : through(ids))
  return {
    state: 'known',
    horizonBlocked: undatedOwed ? 'undated_owed' : null,
    dkkOnly: !foreign,
    dkkToPay: foreign ? null : toPay(Array.from(byCurrency.values()).reduce((sum, value) => roundMoney(sum + value), 0)),
    overdueToPay: foreign ? null : toPay(dkkWindows.overdue),
    horizon30ToPay: horizon(['overdue', 'd30']),
    horizon60ToPay: horizon(['overdue', 'd30', 'd60']),
    horizon90ToPay: horizon(['overdue', 'd30', 'd60', 'd90']),
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
