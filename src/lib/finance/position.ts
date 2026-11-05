/**
 * Likviditet fra allerede indlæste CRM-rækker.
 * En læsefejl må ikke kalde denne funktion med en tom liste — det ville blive 0.
 * Leverandørbeløb er fakturatotaler. CRM gemmer ikke restbetaling på dem.
 */
import { creditTotalsByOriginal, OPEN_OVERDUE_MIN, sentOpenAmount } from '@/lib/invoices/invoice-totals'
import { isDkkInvoice } from '@/lib/invoices/net-invoiced'
import { roundMoney } from '@/lib/utils/money-round'

export type Money = { state: 'known'; amount: number } | { state: 'unknown' }

export interface ReceivableInput {
  id: string
  invoiceNumber: string
  customerId: string | null
  customerName: string | null
  status: string | null
  invoiceType: string | null
  voidedAt: string | null
  currency: string | null
  finalAmount: number | string | null
  amountPaid: number | string | null
  dueDate: string | null
  creditOfInvoiceId: string | null
}

export interface PayableInput {
  id: string
  invoiceNumber: string | null
  supplierName: string | null
  status: string | null
  currency: string | null
  amountInclVat: number | string | null
  dueDate: string | null
  duplicateOfId: string | null
  supplierId: string | null
}

export type ForecastId = 'overdue' | 'd30' | 'd60' | 'd90' | 'later' | 'undated'

export interface ForecastWindow {
  id: ForecastId
  label: string
  inflow: Money
  supplierInvoiceTotal: Money
  supplierCount: number
}

export interface OpenInvoiceRow {
  id: string
  invoiceNumber: string
  customerId: string | null
  customerName: string
  dueDate: string | null
  amount: number
  currency: string
  credit: boolean
  overdueDays: number | null
}

export interface FinancePosition {
  receivables: Money
  openCount: number
  otherCurrencyCount: number
  unknownAmountCount: number
  overdueAmount: Money
  overdueCount: number
  invoices: OpenInvoiceRow[]
  invoicesTruncated: boolean
  forecast: ForecastWindow[]
  payablesKnown: boolean
  /** Sum of approved/posted DKK invoice totals. Not a confirmed remainder. */
  payableInvoiceTotal: Money
  payableCount: number
  payableMissingAmount: number
  payableOtherCurrency: number
  payableDuplicates: number
  awaitingCount: number
  payables: Array<{
    id: string
    invoiceNumber: string | null
    supplierId: string | null
    supplierName: string
    dueDate: string | null
    amount: number | null
    currency: string
  }>
  upcomingInvoices: OpenInvoiceRow[]
  upcomingTruncated: boolean
  overduePayables: FinancePosition['payables']
  upcomingPayables: FinancePosition['payables']
  overduePayablesTruncated: boolean
  upcomingPayablesTruncated: boolean
  receivablesLoaded: boolean
  payablesTruncated: boolean
  missingDueCount: number
  supplierMissingDue: number
  /** Sent credit notes that do not point at an original, so they were not netted. */
  unlinkedCreditCount: number
}

const FORECAST: Array<{ id: ForecastId; label: string }> = [
  { id: 'overdue', label: 'Forfaldne' },
  { id: 'd30', label: '0–30 dage' },
  { id: 'd60', label: '31–60 dage' },
  { id: 'd90', label: '61–90 dage' },
  { id: 'later', label: 'Efter 90 dage' },
  { id: 'undated', label: 'Uden forfaldsdato' },
]

const LIST_CAP = 40

function finite(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function asCalendarDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}

export function addCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function calendarDaysBetween(from: string, to: string): number {
  const utc = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

export function amountReadable(value: number | string | null | undefined): boolean {
  if (value == null || value === '') return false
  return Number.isFinite(Number(value))
}

/** Originals with an issued credit note whose amount cannot be read. Their open amount is not known. */
function originalsWithUnreadableCredit(invoices: ReceivableInput[]): Set<string> {
  const ids = new Set<string>()
  for (const row of invoices) {
    if (row.invoiceType === 'credit' && row.creditOfInvoiceId && !row.voidedAt && (row.status === 'sent' || row.status === 'paid') && !amountReadable(row.finalAmount)) {
      ids.add(row.creditOfInvoiceId)
    }
  }
  return ids
}

export function forecastBucket(due: string | null, today: string): ForecastId {
  if (!due) return 'undated'
  if (due < today) return 'overdue'
  if (due <= addCalendarDays(today, 30)) return 'd30'
  if (due <= addCalendarDays(today, 60)) return 'd60'
  if (due <= addCalendarDays(today, 90)) return 'd90'
  return 'later'
}

function addMoney(sum: Money, value: number | 'unknown'): Money {
  if (value === 'unknown' || sum.state === 'unknown') return { state: 'unknown' }
  return { state: 'known', amount: roundMoney(sum.amount + value) }
}

function emptyWindows(): ForecastWindow[] {
  return FORECAST.map((item) => ({
    id: item.id,
    label: item.label,
    inflow: { state: 'known', amount: 0 },
    supplierInvoiceTotal: { state: 'known', amount: 0 },
    supplierCount: 0,
  }))
}

export function buildFinancePosition(input: {
  today: string
  receivablesLoaded: boolean
  payablesLoaded: boolean
  invoices: ReceivableInput[]
  payables: PayableInput[]
}): FinancePosition {
  const windows = emptyWindows()
  const windowOf = (id: ForecastId) => windows.find((item) => item.id === id)!

  let receivables: Money = input.receivablesLoaded ? { state: 'known', amount: 0 } : { state: 'unknown' }
  let overdueAmount: Money = input.receivablesLoaded ? { state: 'known', amount: 0 } : { state: 'unknown' }
  let openCount = 0
  let overdueCount = 0
  let otherCurrencyCount = 0
  let unknownAmountCount = 0
  let missingDueCount = 0
  let unlinkedCreditCount = 0
  const openRows: OpenInvoiceRow[] = []

  if (!input.receivablesLoaded) {
    for (const window of windows) window.inflow = { state: 'unknown' }
  }

  if (input.receivablesLoaded) {
    const credited = creditTotalsByOriginal(input.invoices.map((row) => ({
      invoice_type: row.invoiceType,
      credit_of_invoice_id: row.creditOfInvoiceId,
      voided_at: row.voidedAt,
      status: row.status ?? '',
      final_amount: row.finalAmount,
    })))
    const unreadableCredit = originalsWithUnreadableCredit(input.invoices)
    for (const row of input.invoices) {
      if (row.invoiceType === 'credit' && !row.voidedAt && (row.status === 'sent' || row.status === 'paid') && !row.creditOfInvoiceId) {
        unlinkedCreditCount += 1
      }
      if (row.voidedAt || row.invoiceType === 'credit' || row.status !== 'sent') continue
      const due = asCalendarDate(row.dueDate)
      const bucket = forecastBucket(due, input.today)
      const readable = amountReadable(row.finalAmount) && amountReadable(row.amountPaid)
      if (!isDkkInvoice(row)) {
        const creditUnreadable = unreadableCredit.has(row.id)
        const open = readable && !creditUnreadable
          ? sentOpenAmount({ id: row.id, final_amount: row.finalAmount, amount_paid: row.amountPaid }, credited)
          : null
        if (open === 0) continue
        otherCurrencyCount += 1
        openRows.push({
          id: row.id,
          invoiceNumber: row.invoiceNumber,
          customerId: row.customerId,
          customerName: row.customerName?.trim() || 'Ukendt kunde',
          dueDate: due,
          amount: open ?? Number.NaN,
          currency: (row.currency || '').toUpperCase() || 'UKENDT',
          credit: false,
          overdueDays: due && due < input.today && open != null && open >= OPEN_OVERDUE_MIN ? calendarDaysBetween(due, input.today) : null,
        })
        continue
      }
      if (!readable || unreadableCredit.has(row.id)) {
        unknownAmountCount += 1
        receivables = { state: 'unknown' }
        windowOf(bucket).inflow = { state: 'unknown' }
        if (due && due < input.today) overdueAmount = { state: 'unknown' }
        if (!due) missingDueCount += 1
        openRows.push({
          id: row.id,
          invoiceNumber: row.invoiceNumber,
          customerId: row.customerId,
          customerName: row.customerName?.trim() || 'Ukendt kunde',
          dueDate: due,
          amount: Number.NaN,
          currency: 'DKK',
          credit: false,
          overdueDays: due && due < input.today ? calendarDaysBetween(due, input.today) : null,
        })
        continue
      }
      const open = sentOpenAmount({ id: row.id, final_amount: row.finalAmount, amount_paid: row.amountPaid }, credited)
      if (open <= 0) continue
      if (!due) missingDueCount += 1
      openCount += 1
      receivables = addMoney(receivables, open)
      windowOf(bucket).inflow = addMoney(windowOf(bucket).inflow, open)
      const overdue = !!due && due < input.today && open >= OPEN_OVERDUE_MIN
      if (overdue) {
        overdueCount += 1
        overdueAmount = addMoney(overdueAmount, open)
      }
      openRows.push({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        customerId: row.customerId,
        customerName: row.customerName?.trim() || 'Ukendt kunde',
        dueDate: due,
        amount: open,
        currency: 'DKK',
        credit: false,
        overdueDays: overdue && due ? calendarDaysBetween(due, input.today) : null,
      })
    }
  }

  let payableInvoiceTotal: Money = input.payablesLoaded ? { state: 'known', amount: 0 } : { state: 'unknown' }
  let payableCount = 0
  let payableMissingAmount = 0
  let payableOtherCurrency = 0
  let payableDuplicates = 0
  let awaitingCount = 0
  let supplierMissingDue = 0
  const payableRows: FinancePosition['payables'] = []

  if (!input.payablesLoaded) {
    for (const window of windows) window.supplierInvoiceTotal = { state: 'unknown' }
  }

  if (input.payablesLoaded) {
    for (const row of input.payables) {
      if (row.duplicateOfId) {
        payableDuplicates += 1
        continue
      }
      if (row.status === 'received' || row.status === 'awaiting_approval') {
        awaitingCount += 1
        continue
      }
      if (row.status !== 'approved' && row.status !== 'posted') continue
      const due = asCalendarDate(row.dueDate)
      const bucket = forecastBucket(due, input.today)
      const amount = finite(row.amountInclVat)
      if (!isDkkInvoice(row)) {
        payableOtherCurrency += 1
        continue
      }
      if (!due) supplierMissingDue += 1
      if (amount == null) {
        payableMissingAmount += 1
        payableInvoiceTotal = { state: 'unknown' }
        windowOf(bucket).supplierInvoiceTotal = { state: 'unknown' }
        payableRows.push({
          id: row.id,
          invoiceNumber: row.invoiceNumber,
          supplierId: row.supplierId,
          supplierName: row.supplierName?.trim() || 'Ukendt leverandør',
          dueDate: due,
          amount: null,
          currency: 'DKK',
        })
        continue
      }
      payableCount += 1
      payableInvoiceTotal = addMoney(payableInvoiceTotal, amount)
      windowOf(bucket).supplierInvoiceTotal = addMoney(windowOf(bucket).supplierInvoiceTotal, amount)
      windowOf(bucket).supplierCount += 1
      payableRows.push({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        supplierId: row.supplierId,
        supplierName: row.supplierName?.trim() || 'Ukendt leverandør',
        dueDate: due,
        amount,
        currency: 'DKK',
      })
    }
  }

  const overdueRows = openRows
    .filter((row) => row.currency === 'DKK' && row.overdueDays != null)
    .sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0))
  const upcomingEnd = addCalendarDays(input.today, 30)
  const upcomingRows = openRows
    .filter((row) => row.currency === 'DKK' && row.dueDate != null && row.dueDate >= input.today && row.dueDate <= upcomingEnd && Number.isFinite(row.amount) && row.amount > 0)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  payableRows.sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99'))
  const overduePayableRows = payableRows.filter((row) => row.dueDate != null && row.dueDate < input.today)
  const upcomingPayableRows = payableRows.filter((row) => row.dueDate != null && row.dueDate >= input.today && row.dueDate <= upcomingEnd)

  return {
    receivables,
    openCount,
    otherCurrencyCount,
    unknownAmountCount,
    overdueAmount,
    overdueCount,
    invoices: overdueRows.slice(0, LIST_CAP),
    invoicesTruncated: overdueRows.length > LIST_CAP,
    forecast: windows,
    payablesKnown: input.payablesLoaded,
    payableInvoiceTotal,
    payableCount,
    payableMissingAmount,
    payableOtherCurrency,
    payableDuplicates,
    awaitingCount,
    payables: payableRows.slice(0, LIST_CAP),
    payablesTruncated: payableRows.length > LIST_CAP,
    upcomingInvoices: upcomingRows.slice(0, LIST_CAP),
    upcomingTruncated: upcomingRows.length > LIST_CAP,
    overduePayables: overduePayableRows.slice(0, LIST_CAP),
    upcomingPayables: upcomingPayableRows.slice(0, LIST_CAP),
    overduePayablesTruncated: overduePayableRows.length > LIST_CAP,
    upcomingPayablesTruncated: upcomingPayableRows.length > LIST_CAP,
    receivablesLoaded: input.receivablesLoaded,
    missingDueCount,
    supplierMissingDue,
    unlinkedCreditCount,
  }
}

export const BOOKKEEPING_FOUNDATION = {
  wouldWrite: false as const,
  text: 'Bogføring til e-conomic er ikke åbnet på denne side. En senere godkendelse skal vise kladden, kræve en bekræftelse og gå gennem den eksisterende eksport. Her oprettes ingen kladde, og der betales intet.',
}
