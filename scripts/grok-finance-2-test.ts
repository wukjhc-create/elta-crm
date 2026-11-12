/**
 * Finance batch 2. Creditor remainders from the existing e-conomic GET client.
 * No network, no database, no write.
 *   node node_modules/tsx/dist/cli.mjs scripts/grok-finance-2-test.ts
 */
import { readFileSync } from 'node:fs'
import { economicGetWithSettings, type ReadyEconomicSettings } from '../src/lib/services/economic-client'
import { CREDITOR_ENTRY_PAGE, CREDITOR_MAX_PAGES, readOpenSupplierRemainders } from '../src/lib/economic/read'
import { economicReadPathAllowed } from '../src/lib/economic/read-model'
import { aggregateCreditorRemainders, classifyCreditorRow, matchIncomingInvoice, matchSupplier, type CreditorEntry, type InvoiceLink, type SupplierLink } from '../src/lib/economic/supplier-remainder'
import { buildCashPosition, formatQualifiedKr, type BookedBankInput } from '../src/lib/finance/cash-position'
import { buildFinanceAlertTile, buildFinanceDesk, type FinanceCtx, type FinanceDeps } from '../src/lib/finance/finance-desk'
import type { PayableInput, ReceivableInput } from '../src/lib/finance/position'
import { hasPermission, type Permission } from '../src/lib/auth/permissions'
import type { UserRole } from '../src/types/auth.types'
import { formatCurrency } from '../src/lib/utils/format'

let failed = 0
function t(name: string, ok: boolean, note = '') {
  if (!ok) {
    failed += 1
    console.error(`FAIL  ${name}${note ? ` — ${note}` : ''}`)
  }
}

const today = '2026-11-04'
const zeroKr = formatCurrency(0, 'DKK', 2)
const SECRET = 'HEMMELIG-TOKEN'
const ready = {
  provider: 'economic',
  active: true,
  api_token: SECRET,
  agreement_grant_token: SECRET,
  config: { bankContraAccountNumber: 5820 },
} as unknown as ReadyEconomicSettings

function bankInput(): BookedBankInput {
  return {
    permitted: true,
    credentialsReady: true,
    accountNumber: 5820,
    accountName: 'Bank',
    probe: 'not_needed',
    balance: { outcome: 'known', amount: 1000 },
    readAt: '2026-11-04T08:00:00.000Z',
  }
}

function invoice(partial: Partial<ReceivableInput> & Pick<ReceivableInput, 'id'>): ReceivableInput {
  return {
    invoiceNumber: partial.id,
    customerId: 'c1',
    customerName: 'Kunde',
    status: 'sent',
    invoiceType: 'standard',
    voidedAt: null,
    currency: 'DKK',
    finalAmount: 0,
    amountPaid: 0,
    dueDate: today,
    creditOfInvoiceId: null,
    ...partial,
  }
}

function payable(partial: Partial<PayableInput> & Pick<PayableInput, 'id'>): PayableInput {
  return {
    invoiceNumber: partial.id,
    supplierName: 'CRM-leverandør',
    supplierId: 'sup-1',
    status: 'approved',
    currency: 'DKK',
    amountInclVat: 999,
    dueDate: '2026-11-10',
    duplicateOfId: null,
    ...partial,
  }
}

function row(partial: Record<string, unknown> = {}) {
  return {
    entryNumber: 1,
    entryType: 'supplierInvoice',
    currency: 'DKK',
    remainder: -400,
    dueDate: '2026-11-20',
    amount: -1000,
    remainderInBaseCurrency: -29756.33,
    supplier: { supplierNumber: 7 },
    supplierInvoiceNumber: 'INV-1',
    ...partial,
  }
}

function knownFrom(entries: unknown[], year = '2024') {
  return aggregateCreditorRemainders({
    complete: true,
    today,
    rows: entries.map((entry) => ({ year, row: entry })),
  })
}

function cashFrom(entries: unknown[], extra: Partial<Parameters<typeof buildCashPosition>[0]> = {}) {
  return buildCashPosition({
    today,
    calculatedAt: '2026-11-04T08:00:00.000Z',
    receivablesLoaded: true,
    payablesLoaded: true,
    invoices: [invoice({ id: 'none', finalAmount: 0, amountPaid: 0 })],
    payables: [payable({ id: 'crm-total' })],
    bank: bankInput(),
    creditors: knownFrom(entries),
    ...extra,
  })
}

type Call = { url: string; method: string; body: unknown; path: string; filter: string | null; skip: string | null; pagesize: string | null }
const calls: Call[] = []
function mockFetch(handler: (url: URL) => { status: number; body: string } | 'hang' | 'throw') {
  calls.length = 0
  globalThis.fetch = (async (url: unknown, init?: { method?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal }) => {
    const parsed = new URL(String(url))
    calls.push({
      url: parsed.toString(),
      method: init?.method ?? 'GET',
      body: init?.body,
      path: parsed.pathname,
      filter: parsed.searchParams.get('filter'),
      skip: parsed.searchParams.get('skippages'),
      pagesize: parsed.searchParams.get('pagesize'),
    })
    const result = handler(parsed)
    if (result === 'throw') throw new Error(`netværk ${SECRET}`)
    if (result === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    }
    return { ok: result.status < 400, status: result.status, text: async () => result.body } as Response
  }) as typeof fetch
}
const body = (data: unknown, status = 200) => ({ status, body: JSON.stringify(data) })
const page = (rows: unknown[], results = rows.length, nextPage?: string) => body({ collection: rows, pagination: { results, ...(nextPage ? { nextPage } : {}) } })

function years(rows: unknown[]) {
  return page(rows, rows.length)
}
function emptyEntries() {
  return page([])
}

function builder(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const self: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'neq', 'is', 'not', 'gte', 'lte']) self[method] = () => self
  self.range = () => self
  self.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({
    data: result.data ?? [],
    error: result.error ?? null,
    count: result.count ?? null,
  }).then(resolve, reject)
  return self
}

function ctxFor(role: UserRole, tables: Record<string, { data?: unknown; error?: unknown; count?: number | null }> = {}) {
  const reads: string[] = []
  const has = (key: Permission) => hasPermission(role, key)
  const ctx: FinanceCtx = {
    supabase: { from: (table: string) => { reads.push(table); return builder(tables[table] ?? {}) } },
    hasPermission: has,
    permissions: { has },
  }
  return { ctx, reads }
}

const NOW = new Date('2026-11-04T12:00:00Z')

async function main() {
  const realFetch = globalThis.fetch
  const realSetTimeout = globalThis.setTimeout
  delete process.env.ECONOMIC_PUSH_ENABLED
  try {
    t('entries path is allowlisted and narrower paths are not', economicReadPathAllowed('/accounting-years/2024/entries') && !economicReadPathAllowed('/accounting-years/2024/2025/entries') && !economicReadPathAllowed('/accounting-years/24/entries') && !economicReadPathAllowed('/accounting-years/2024/entries/1') && !economicReadPathAllowed('/accounting-years/2024/totals') && !economicReadPathAllowed('/booked-entries'))

    const partial = classifyCreditorRow(row())
    t('partial payment uses remainder, not the invoice total or the base-currency conversion', partial.kind === 'item' && partial.item.remainder === -400 && !('amount' in partial.item))
    const settled = knownFrom([row({ remainder: -400, dueDate: '2026-10-01' }), row({ entryNumber: 2, remainder: 0, amount: -5000 })])
    t('a zero remainder is settled and is not part of the sum', settled.state === 'known' && settled.dkkToPay === 400)

    const contra = knownFrom([
      row(),
      row({ entryNumber: 2, supplier: null, remainder: null, amount: 5000, entryType: 'supplierInvoice' }),
      row({ entryNumber: 3, entryType: 'customerInvoice', remainder: -8000, supplier: null, customer: { customerNumber: 11 } }),
    ])
    t('a contra line and a customer open item are ignored', contra.state === 'known' && contra.dkkToPay === 400 && contra.items.length === 1)
    // Claude review: a customer-side type that names a supplier is contradictory, so the sum is unknown (not ignored, not counted)
    t('a customer-type entry with a supplier makes the read unknown', knownFrom([row(), row({ entryNumber: 3, entryType: 'customerInvoice', remainder: -8000 })]).state === 'unknown')

    const undated = knownFrom([row({ dueDate: null })])
    // Claude review: undated DKK debt cannot be placed in a horizon. Leaving it out would overstate projected cash, so
    // the horizons are unknown; the total and the unscheduled figure stay known.
    t('undated debt: total known, 30/60/90 unknown with a reason', undated.state === 'known' && undated.unscheduledToPay === 400 && undated.horizon30ToPay === null && undated.horizon60ToPay === null && undated.horizon90ToPay === null && undated.dkkToPay === 400 && undated.horizonBlocked === 'undated_owed')

    const dated = knownFrom([
      row({ entryNumber: 1, remainder: -20, dueDate: '2026-10-01' }),
      row({ entryNumber: 2, remainder: -50, dueDate: today }),
      row({ entryNumber: 3, remainder: -30, dueDate: '2026-12-05' }),
      row({ entryNumber: 4, remainder: -10, dueDate: '2027-01-04' }),
      row({ entryNumber: 5, remainder: -70, dueDate: '2027-02-03' }),
    ])
    t('due today is not overdue and the horizons are cumulative', dated.state === 'known' && dated.overdueToPay === 20 && dated.horizon30ToPay === 70 && dated.horizon60ToPay === 100 && dated.horizon90ToPay === 110 && dated.dkkToPay === 180)

    const foreign = knownFrom([row(), row({ entryNumber: 8, currency: 'EUR', remainder: -4000, dueDate: '2026-06-03' })])
    t('a foreign remainder is kept and is not folded into DKK', foreign.state === 'known' && foreign.dkkOnly === false && foreign.dkkToPay === null && foreign.horizon30ToPay === null && foreign.currencies.some((item) => item.currency === 'EUR' && item.remainder === -4000) && !JSON.stringify(foreign).includes('-29756.33'))

    const unreadable = [
      row({ remainder: null }),
      row({ supplier: null, remainder: -100 }),
      row({ currency: null }),
      row({ currency: 'dkk' }),
      row({ dueDate: '04-11-2026' }),
      row({ supplierInvoiceNumber: 12 }),
      row({ entryNumber: 1.5 }),
    ]
    t('an unreadable supplier row makes the set unknown', unreadable.every((item) => knownFrom([item]).state === 'unknown'))
    t('an incomplete page is unknown', aggregateCreditorRemainders({ complete: false, today, rows: [{ year: '2024', row: row() }] }).state === 'unknown')
    t('a duplicate entry is unknown', knownFrom([row(), row()]).state === 'unknown')
    t('a year that is not four digits is unknown', aggregateCreditorRemainders({ complete: true, today, rows: [{ year: '2024/2025', row: row() }] }).state === 'unknown')
    t('an empty finished set is a real zero', knownFrom([]).state === 'known' && knownFrom([]).dkkToPay === 0)

    const payment = knownFrom([row({ entryType: 'supplierPayment', remainder: 7000, dueDate: null, supplierInvoiceNumber: null })])
    t('an unmatched payment remainder keeps its sign', payment.state === 'known' && payment.dkkToPay === -7000 && payment.unscheduledToPay === -7000 && payment.horizon30ToPay === 0)
    const opening = knownFrom([row({ entryType: 'openingEntry', remainder: -15, supplierInvoiceNumber: null }), row({ entryNumber: 9, entryType: 'transferredOpeningEntry', remainder: -5, supplierInvoiceNumber: null })])
    t('opening entries with a supplier remainder are included', opening.state === 'known' && opening.dkkToPay === 20)

    const many = knownFrom(Array.from({ length: 41 }, (_, index) => row({ entryNumber: index + 1, remainder: -1, supplierInvoiceNumber: null })))
    const manyCash = buildCashPosition({
      today,
      calculatedAt: '2026-11-04T08:00:00.000Z',
      receivablesLoaded: true,
      payablesLoaded: true,
      invoices: [],
      payables: [],
      bank: bankInput(),
      creditors: many,
    })
    t('the queue shows 40 and the total uses all 41', many.state === 'known' && many.dkkToPay === 41 && manyCash.openCreditorEntries.length === 40 && manyCash.creditorEntriesTruncated && manyCash.openPayables.amount === 41)

    const position = cashFrom([row()])
    t('a complete DKK remainder becomes the outgoing and the invoice total does not', position.openPayables.source === 'economic_open_items' && position.openPayables.amount === 400 && position.forecast30.expectedOutgoing.amount === 400 && position.forecast30.projectedCash.amount === 600 && position.ledger.payableInvoiceTotal.amount === 999)
    t('projected cash renders as kroner', formatQualifiedKr(position.forecast30.projectedCash) === formatCurrency(600, 'DKK', 2) && formatQualifiedKr(position.openPayables) === formatCurrency(400, 'DKK', 2))
    t('the creditor queue says rest and keeps the due date', position.openCreditorEntries[0]?.amountLabel === 'Rest' && position.openCreditorEntries[0]?.amount === 400 && position.openCreditorEntries[0]?.currency === 'DKK' && position.openCreditorEntries[0]?.dueDate === '2026-11-20' && position.openCreditorEntries[0]?.documentHref === null)

    const undatedCash = cashFrom([row({ dueDate: null })])
    t('undated creditor debt makes projected cash unknown, not higher', undatedCash.openPayables.amount === 400 && undatedCash.forecast30.expectedOutgoing.amount === null && undatedCash.forecast30.unscheduledPayables.amount === 400 && undatedCash.forecast30.projectedCash.amount === null && /uden forfaldsdato/.test(undatedCash.forecast30.expectedOutgoing.detail ?? ''))

    const foreignCash = cashFrom([row({ currency: 'EUR', remainder: -4000 })])
    t('foreign currency keeps projected cash unknown', foreignCash.openPayables.amount === null && foreignCash.openPayables.source === 'unavailable' && foreignCash.forecast30.projectedCash.amount === null && formatQualifiedKr(foreignCash.forecast30.projectedCash) === 'Ukendt' && formatQualifiedKr(foreignCash.openPayables) !== zeroKr && foreignCash.creditorCurrencies[0]?.currency === 'EUR' && foreignCash.creditorCurrencies[0]?.remainder === -4000)

    const failedCash = buildCashPosition({
      today,
      calculatedAt: '2026-11-04T08:00:00.000Z',
      receivablesLoaded: true,
      payablesLoaded: true,
      invoices: [],
      payables: [payable({ id: 'crm-total' })],
      bank: bankInput(),
      creditors: { state: 'error' },
    })
    t('a failed creditor read is not 0 and does not use the invoice total', failedCash.openPayables.source === 'error' && failedCash.openPayables.amount === null && formatQualifiedKr(failedCash.openPayables) === 'Ukendt' && formatQualifiedKr(failedCash.openPayables) !== zeroKr && failedCash.forecast30.projectedCash.amount === null && failedCash.alerts.some((alert) => alert.code === 'creditor_read_failed'))

    const unknownCash = buildCashPosition({
      today,
      calculatedAt: '2026-11-04T08:00:00.000Z',
      receivablesLoaded: true,
      payablesLoaded: true,
      invoices: [],
      payables: [payable({ id: 'crm-total' })],
      bank: bankInput(),
      creditors: { state: 'unknown' },
    })
    t('an unverified remainder stays unknown', unknownCash.openPayables.source === 'unavailable' && unknownCash.openPayables.amount === null && unknownCash.forecast90.projectedCash.amount === null && formatQualifiedKr(unknownCash.openPayables) !== zeroKr)

    const zeroCash = cashFrom([])
    t('a real empty remainder is 0 kr and the projection is numeric', zeroCash.openPayables.source === 'economic_open_items' && zeroCash.openPayables.amount === 0 && formatQualifiedKr(zeroCash.openPayables) === zeroKr && zeroCash.forecast30.projectedCash.amount === 1000)

    const omitted = buildCashPosition({
      today,
      calculatedAt: '2026-11-04T08:00:00.000Z',
      receivablesLoaded: true,
      payablesLoaded: true,
      invoices: [],
      payables: [],
      bank: bankInput(),
    })
    t('no creditor input keeps the previous gap', omitted.openPayables.source === 'unavailable' && omitted.openPayables.amount === null && omitted.forecast30.projectedCash.amount === null)

    const hidden = cashFrom([row()], { payablesVisible: false })
    t('a hidden creditor section has no amount and no rows', hidden.openPayables.source === 'unavailable' && hidden.openPayables.amount === null && hidden.openCreditorEntries.length === 0 && hidden.creditorCurrencies.length === 0)

    const links: SupplierLink[] = [
      { id: 's1', name: ' AO ', externalSupplierId: '7', externalProvider: 'economic' },
      { id: 's2', name: 'Anden', externalSupplierId: '8', externalProvider: 'economic' },
      { id: 's3', name: 'Tekst', externalSupplierId: '7', externalProvider: 'csv' },
      { id: 's4', name: 'Nul', externalSupplierId: '007', externalProvider: 'economic' },
    ]
    const one = matchSupplier(7, links)
    t('one exact supplier number matches', one.state === 'matched' && one.supplierId === 's1' && one.name === 'AO')
    t('a padded number is not the same supplier', matchSupplier(7, [links[3]]).state === 'unmatched')
    t('two exact rows are ambiguous', matchSupplier(7, [...links, { id: 's5', name: 'Kopi', externalSupplierId: '7', externalProvider: 'economic' }]).state === 'ambiguous')
    t('a failed supplier list is unknown', matchSupplier(7, null).state === 'unknown')
    const matched = matchSupplier(7, links)
    const invoices: InvoiceLink[] = [
      { id: 'inv-1', supplierId: 's1', externalInvoiceId: 'INV-1', externalProvider: 'economic' },
      { id: 'inv-2', supplierId: 's2', externalInvoiceId: 'INV-1', externalProvider: 'economic' },
      { id: 'inv-3', supplierId: 's1', externalInvoiceId: ' INV-1 ', externalProvider: 'other' },
    ]
    const sample = { ...(partial.kind === 'item' ? partial.item : { entryNumber: 1, entryType: 'supplierInvoice' as const, supplierNumber: 7, supplierInvoiceNumber: 'INV-1', currency: 'DKK', remainder: -400, dueDate: '2026-11-20' }), year: '2024' }
    t('the invoice link needs the matched supplier and the same number', matchIncomingInvoice(sample, matched, invoices) === 'inv-1')
    t('two invoices on the same supplier do not link', matchIncomingInvoice(sample, matched, [...invoices, { id: 'inv-4', supplierId: 's1', externalInvoiceId: 'INV-1', externalProvider: 'economic' }]) === null)
    t('no invoice number does not link by supplier alone', matchIncomingInvoice({ ...sample, supplierInvoiceNumber: null }, matched, invoices) === null)
    const ambiguous = matchSupplier(7, null)
    t('an unknown supplier match does not link an invoice', matchIncomingInvoice(sample, ambiguous, invoices) === null)

    const linkedCash = buildCashPosition({
      today,
      calculatedAt: '2026-11-04T08:00:00.000Z',
      receivablesLoaded: true,
      payablesLoaded: true,
      invoices: [],
      payables: [],
      bank: bankInput(),
      creditors: knownFrom([row()]),
      creditorParty: () => ({ party: 'AO', partyHref: '/dashboard/settings/suppliers/s1', documentHref: '/dashboard/incoming-invoices/inv-1' }),
    })
    t('a resolved creditor row links supplier and invoice', linkedCash.openCreditorEntries[0]?.partyHref === '/dashboard/settings/suppliers/s1' && linkedCash.openCreditorEntries[0]?.documentHref === '/dashboard/incoming-invoices/inv-1' && linkedCash.openCreditorEntries[0]?.party === 'AO')

    mockFetch((url) => {
      if (url.pathname === '/accounting-years') return years([{ year: '2024' }, { year: 2023 }])
      if (url.pathname === '/accounting-years/2024/entries' && url.searchParams.get('filter') === 'remainder$ne:0') {
        return page([row({ dueDate: '2026-11-20' })])
      }
      if (url.pathname === '/accounting-years/2023/entries' && url.searchParams.get('filter') === 'remainder$ne:0') {
        return page([row({ entryNumber: 5, entryType: 'supplierPayment', remainder: 100, dueDate: '2026-12-05', supplierInvoiceNumber: null, amount: 100 })])
      }
      if (url.pathname.endsWith('/entries')) return emptyEntries()
      return body({ message: 'ukendt sti' }, 404)
    })
    const read = await readOpenSupplierRemainders(ready, today)
    t('the reader sums both years and both signs', read.state === 'known' && read.dkkOnly && read.dkkToPay === 300 && read.horizon30ToPay === 400 && read.horizon60ToPay === 300)
    t('every call is GET on the allowlisted host, one open-item read per year (no entryType filter)', calls.length === 3 && calls.every((call) => !(call.filter ?? '').includes('entryType')) && calls.every((call) => call.method === 'GET' && call.body === undefined && call.url.startsWith('https://restapi.e-conomic.com/') && economicReadPathAllowed(call.path)))
    t('the filter is a query and pagesize is the documented maximum', calls.filter((call) => call.path.endsWith('/entries')).every((call) => call.pagesize === String(CREDITOR_ENTRY_PAGE) && call.filter?.includes('remainder$ne:0') && !call.path.includes('remainder')))
    t('the read result does not contain the token', !JSON.stringify(read).includes(SECRET))

    mockFetch((url) => {
      if (url.pathname === '/accounting-years') return years([{ year: '2024' }])
      if (url.searchParams.get('filter') === 'remainder$ne:0') {
        const skip = Number(url.searchParams.get('skippages'))
        if (skip === 0) {
          return page(Array.from({ length: CREDITOR_ENTRY_PAGE }, (_, index) => row({ entryNumber: index + 1, remainder: -1, supplierInvoiceNumber: null })), CREDITOR_ENTRY_PAGE + 1, 'https://evil.example/steal')
        }
        return page([row({ entryNumber: CREDITOR_ENTRY_PAGE + 1, remainder: -1, supplierInvoiceNumber: null })], CREDITOR_ENTRY_PAGE + 1)
      }
      if (url.pathname.endsWith('/entries')) return emptyEntries()
      return body({ message: 'nej' }, 500)
    })
    const paged = await readOpenSupplierRemainders(ready, today)
    t('a second page is requested on the same path and the next URL is not followed', paged.state === 'known' && paged.dkkToPay === CREDITOR_ENTRY_PAGE + 1 && calls.some((call) => call.skip === '1' && call.path === '/accounting-years/2024/entries') && calls.every((call) => !call.url.includes('evil.example')))

    mockFetch((url) => {
      if (url.pathname === '/accounting-years') return years([{ year: '2024' }])
      if (url.pathname.endsWith('/entries')) return page(Array.from({ length: CREDITOR_ENTRY_PAGE }, () => ({})), 999999, 'https://evil.example/next')
      return body({}, 500)
    })
    const capped = await readOpenSupplierRemainders(ready, today)
    t('the page cap is unknown and not a partial sum', capped.state === 'unknown' && calls.filter((call) => call.path.endsWith('/entries')).length === CREDITOR_MAX_PAGES)

    mockFetch((url) => (url.pathname === '/accounting-years' ? years([{ year: '2024/2025' }]) : body({}, 500)))
    const slashYear = await readOpenSupplierRemainders(ready, today)
    t('a split accounting year is unknown and entries are not requested', slashYear.state === 'unknown' && calls.length === 1)

    mockFetch((url) => (url.pathname === '/accounting-years' ? page([]) : body({}, 500)))
    const emptyYears = await readOpenSupplierRemainders(ready, today)
    t('no accounting years is a real empty remainder', emptyYears.state === 'known' && emptyYears.dkkToPay === 0 && calls.length === 1)

    mockFetch((url) => {
      if (url.pathname === '/accounting-years') return years([{ year: '2024' }])
      if (url.pathname.endsWith('/entries')) return page([row()], 5)
      return body({}, 500)
    })
    t('a results count that disagrees with the rows is unknown', (await readOpenSupplierRemainders(ready, today)).state === 'unknown')

    mockFetch((url) => {
      if (url.pathname === '/accounting-years') return years([{ year: '2024' }])
      return body({ message: 'ikke en liste' })
    })
    t('a body without collection is unknown', (await readOpenSupplierRemainders(ready, today)).state === 'unknown')

    mockFetch((url) => (url.pathname === '/accounting-years' ? body({ message: `rå ${SECRET}` }, 503) : body({}, 500)))
    const httpFailed = await readOpenSupplierRemainders(ready, today)
    t('HTTP 503 is an error and the raw text is dropped', httpFailed.state === 'error' && !JSON.stringify(httpFailed).includes(SECRET))

    globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 5)) as unknown as typeof setTimeout
    mockFetch(() => 'hang')
    const timedOut = await readOpenSupplierRemainders(ready, today)
    globalThis.setTimeout = realSetTimeout
    t('a timeout is an error', timedOut.state === 'error')

    mockFetch(() => 'throw')
    const thrown = await readOpenSupplierRemainders(ready, today)
    t('a network failure is an error without the raw message', thrown.state === 'error' && !JSON.stringify(thrown).includes(SECRET))

    calls.length = 0
    const disallowed = await economicGetWithSettings(ready, '/accounting-years/2024/entries?filter=1')
    t('a query inside the path never reaches fetch', !disallowed.ok && calls.length === 0)

    const tables = {
      invoices: { data: [] },
      customers: { data: [] },
      incoming_invoices: { data: [{ id: 'inv-1', invoice_number: 'INV-1', supplier_name_extracted: 'AO', status: 'approved', currency: 'DKK', amount_incl_vat: 999, due_date: '2026-11-20', duplicate_of_id: null, supplier_id: 's1', external_invoice_id: 'INV-1', external_provider: 'economic' }] },
      suppliers: { data: [{ id: 's1', name: 'AO', external_supplier_id: '7', external_provider: 'economic' }] },
      bank_transactions: { count: 0 },
    }
    let creditorCalls = 0
    const deps = (): FinanceDeps => ({
      readSettings: async () => ({ state: 'found', settings: ready }),
      readBalance: async () => ({ state: 'known', amount: 1000, accountName: 'Bank' }),
      readYears: async () => ({ ok: true, complete: true }),
      readCreditors: async () => {
        creditorCalls += 1
        return knownFrom([row()])
      },
    })

    {
      creditorCalls = 0
      const { ctx, reads } = ctxFor('serviceleder', tables)
      const desk = await buildFinanceDesk(ctx, deps(), NOW)
      t('serviceleder does not call the creditor read', desk.ok === true && creditorCalls === 0 && !reads.includes('suppliers') && desk.seesPayables && !desk.seesEconomic)
      if (desk.ok) t('serviceleder payables stay the gap', desk.cash.openPayables.amount === null && formatQualifiedKr(desk.cash.openPayables) !== zeroKr)
    }
    {
      creditorCalls = 0
      const { ctx } = ctxFor('bogholderi', tables)
      const desk = await buildFinanceDesk(ctx, deps(), NOW)
      t('bogholderi with both permissions reads the remainder once', desk.ok === true && creditorCalls === 1)
      if (desk.ok) {
        t('the desk uses the remainder and still shows the invoice total beside it', desk.cash.openPayables.amount === 400 && desk.cash.openPayables.source === 'economic_open_items' && desk.position.payableInvoiceTotal.amount === 999 && desk.cash.forecast30.projectedCash.amount === 600)
        t('the matched supplier and invoice are linked', desk.cash.openCreditorEntries[0]?.partyHref === '/dashboard/settings/suppliers/s1' && desk.cash.openCreditorEntries[0]?.documentHref === '/dashboard/incoming-invoices/inv-1' && desk.creditorSuppliersKnown && desk.creditorInvoicesKnown)
        t('the desk response has no token', !JSON.stringify(desk).includes(SECRET))
      }
    }
    {
      creditorCalls = 0
      const ambiguousTables = {
        ...tables,
        suppliers: { data: [
          { id: 's1', name: 'AO', external_supplier_id: '7', external_provider: 'economic' },
          { id: 's9', name: 'AO kopi', external_supplier_id: '7', external_provider: 'economic' },
        ] },
      }
      const desk = await buildFinanceDesk(ctxFor('bogholderi', ambiguousTables).ctx, deps(), NOW)
      t('an ambiguous supplier is not linked and the amount stays', desk.ok === true && desk.cash.openPayables.amount === 400 && desk.cash.openCreditorEntries[0]?.partyHref === null && desk.cash.openCreditorEntries[0]?.documentHref === null && desk.cash.openCreditorEntries[0]?.party === 'Leverandør 7')
    }
    {
      creditorCalls = 0
      const brokenSuppliers = { ...tables, suppliers: { error: { message: 'rls' } } }
      const desk = await buildFinanceDesk(ctxFor('bogholderi', brokenSuppliers).ctx, deps(), NOW)
      t('a failed supplier list keeps the remainder and links nobody', desk.ok === true && desk.cash.openPayables.amount === 400 && !desk.creditorSuppliersKnown && desk.cash.openCreditorEntries[0]?.partyHref === null)
    }
    {
      creditorCalls = 0
      const brokenInvoices = { ...tables, incoming_invoices: { error: { message: 'rls' } } }
      const desk = await buildFinanceDesk(ctxFor('bogholderi', brokenInvoices).ctx, deps(), NOW)
      t('a failed invoice read does not wipe the remainder', desk.ok === true && desk.cash.openPayables.amount === 400 && desk.cash.openPayables.source === 'economic_open_items' && !desk.creditorInvoicesKnown && desk.cash.openCreditorEntries[0]?.documentHref === null)
    }
    {
      creditorCalls = 0
      const failedDeps: FinanceDeps = { ...deps(), readCreditors: async () => { creditorCalls += 1; return { state: 'error' } } }
      const desk = await buildFinanceDesk(ctxFor('bogholderi', tables).ctx, failedDeps, NOW)
      t('a failed remainder is not replaced by the invoice total', desk.ok === true && creditorCalls === 1 && desk.cash.openPayables.source === 'error' && desk.cash.openPayables.amount === null && formatQualifiedKr(desk.cash.openPayables) !== zeroKr && desk.cash.forecast30.projectedCash.amount === null && desk.position.payableInvoiceTotal.amount === 999)
    }
    {
      creditorCalls = 0
      const missing: FinanceDeps = { ...deps(), readSettings: async () => ({ state: 'missing' }), readCreditors: async () => { creditorCalls += 1; return knownFrom([row()]) } }
      const desk = await buildFinanceDesk(ctxFor('bogholderi', tables).ctx, missing, NOW)
      t('missing credentials do not call e-conomic and are not zero', creditorCalls === 0 && desk.ok === true && desk.cash.openPayables.amount === null && desk.cash.openPayables.source === 'unavailable' && formatQualifiedKr(desk.cash.openPayables) !== zeroKr)
    }
    {
      creditorCalls = 0
      const errored: FinanceDeps = { ...deps(), readSettings: async () => ({ state: 'error' }) }
      const desk = await buildFinanceDesk(ctxFor('bogholderi', tables).ctx, errored, NOW)
      t('a settings failure is a creditor error and does not call the reader', creditorCalls === 0 && desk.ok === true && desk.cash.openPayables.source === 'error' && formatQualifiedKr(desk.cash.openPayables) !== zeroKr)
    }

    const tileSrc = readFileSync(new URL('../src/lib/finance/finance-desk.ts', import.meta.url), 'utf8')
    const tileFn = tileSrc.slice(tileSrc.indexOf('export async function buildFinanceAlertTile'))
    t('the dashboard tile does not read creditor entries', !tileFn.includes('readCreditors') && !tileFn.includes('readOpenSupplierRemainders') && !tileFn.includes('economicGet'))
    const tile = await buildFinanceAlertTile(ctxFor('bogholderi', tables).ctx, async () => ({ state: 'found', settings: ready }), NOW)
    t('the tile stays hidden without a threshold and does not need creditors', tile.state === 'hidden')

    const pageSrc = readFileSync(new URL('../src/app/dashboard/finance/page.tsx', import.meta.url), 'utf8')
    t('the page names the remainder and still labels invoice totals', pageSrc.includes('Åbne kreditorposter i e-conomic') && pageSrc.includes('Fakturabeløb. Resten er ukendt') && !pageSrc.includes('economicGet') && !pageSrc.includes(SECRET))
    const readerSrc = readFileSync(new URL('../src/lib/economic/read.ts', import.meta.url), 'utf8')
    t('the reader does not log, write or open another client', !readerSrc.includes('logAttempt') && !readerSrc.includes('last_sync_at') && !readerSrc.includes(".from('") && !readerSrc.includes("method: 'POST'") && readerSrc.includes('economicGetWithSettings'))

    if (failed) {
      console.error(`${failed} failed`)
      process.exit(1)
    }
    console.log('grok-finance-2-test: ok')
  } finally {
    globalThis.fetch = realFetch
    globalThis.setTimeout = realSetTimeout
  }
}

void main()
