/**
 * Claude-review af finance batch 1: de rigtige kodestier med mocket fetch og falsk databaseklient. Intet netværk,
 * ingen database, ingen e-conomic.
 *   npx tsx scripts/grok-finance-1-review-test.ts
 */
import { readFileSync } from 'node:fs'
import { economicGetWithSettings, isEconomicReady, type EconomicSettingsRead, type ReadyEconomicSettings } from '../src/lib/services/economic-client'
import { readAccountingYears, readBankAccountBalance } from '../src/lib/economic/read'
import { economicReadPathAllowed, parseCollection, parseLedgerAccount } from '../src/lib/economic/read-model'
import { buildFinanceAlertTile, buildFinanceDesk, ECONOMIC_DEPS, type FinanceCtx, type FinanceDeps } from '../src/lib/finance/finance-desk'
import { buildCashPosition, formatQualifiedKr, projectCash } from '../src/lib/finance/cash-position'
import { buildFinancePosition, forecastBucket, type ReceivableInput } from '../src/lib/finance/position'
import { computeInvoiceTotals, type InvoiceTotalsRow } from '../src/lib/invoices/invoice-totals'
import { hasPermission, type Permission } from '../src/lib/auth/permissions'
import { copenhagenParts } from '../src/lib/utils/copenhagen-time'
import { formatCurrency } from '../src/lib/utils/format'
import type { UserRole } from '../src/types/auth.types'

let bad = 0
let passed = 0
function t(label: string, ok: boolean, note = '') {
  if (ok) passed++
  else { bad++; console.error(`FAIL  ${label}${note ? ` — ${note}` : ''}`) }
}

const SECRET_A = 'HEMMELIG-APP-TOKEN'
const SECRET_B = 'HEMMELIG-GRANT-TOKEN'
const ready = {
  provider: 'economic',
  active: true,
  api_token: SECRET_A,
  agreement_grant_token: SECRET_B,
  config: { bankContraAccountNumber: 5820 },
} as unknown as ReadyEconomicSettings
const ACCOUNT = { accountNumber: 5820, accountType: 'status', name: 'Bank', balance: 1234.5 }

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown }
const calls: Call[] = []
function mockFetch(respond: () => { status: number; body: string } | 'hang' | 'throw') {
  calls.length = 0
  globalThis.fetch = (async (url: unknown, init?: { method?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal }) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body })
    const r = respond()
    if (r === 'throw') throw new Error(`netværk ${SECRET_A}`)
    if (r === 'hang') {
      return new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    }
    return { ok: r.status < 400, status: r.status, text: async () => r.body } as Response
  }) as typeof fetch
}
const json = (data: unknown, status = 200) => () => ({ status, body: JSON.stringify(data) })

function builder(result: { data?: unknown; error?: unknown; count?: number | null }, onCall?: () => void) {
  onCall?.()
  const self: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'neq', 'is', 'not', 'gte', 'lte']) self[m] = () => self
  self.range = () => self
  self.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: result.data ?? [], error: result.error ?? null, count: result.count ?? null }).then(res, rej)
  return self
}

const INVOICE_ROW = { id: 'i1', invoice_number: 'F1', customer_id: 'c1', status: 'sent', invoice_type: 'standard', voided_at: null, currency: 'DKK', final_amount: 1000, amount_paid: 250, due_date: '2026-10-01', credit_of_invoice_id: null }
function ctxFor(role: UserRole, tables: Record<string, { data?: unknown; error?: unknown; count?: number | null }> = {}, extra: Permission[] = [], minus: Permission[] = []) {
  const reads: string[] = []
  const has = (key: Permission) => !minus.includes(key) && (hasPermission(role, key) || extra.includes(key))
  const ctx: FinanceCtx = {
    supabase: { from: (table: string) => { reads.push(table); return builder(tables[table] ?? {}) } },
    hasPermission: has,
    permissions: { has },
  }
  return { ctx, reads }
}
function depsFor(read: EconomicSettingsRead = { state: 'found', settings: ready }) {
  const seen = { settings: 0, balance: 0, years: 0 }
  const deps: FinanceDeps = {
    readSettings: async () => { seen.settings++; return read },
    readBalance: async (s, n) => { seen.balance++; return readBankAccountBalance(s, n) },
    readYears: async (s) => { seen.years++; return readAccountingYears(s) },
  }
  return { deps, seen }
}
const NOW = new Date('2026-11-04T12:00:00Z')
const today = '2026-11-04'
const zeroKr = formatCurrency(0, 'DKK', 2)

async function main() {
  const realFetch = globalThis.fetch
  const realConsoleError = console.error
  try {
    // ---------- allowlist
    for (const ok of ['/accounting-years', '/accounts/5820', '/accounting-years/2024/entries']) t(`tilladt: ${ok}`, economicReadPathAllowed(ok))
    const bypass = [
      '/accounts/5820?x=1', '/accounts/5820#x', '/accounts/5820/', '/accounts/5820/../invoices/drafts', '/accounts/../invoices/drafts', '/accounts/%2e%2e/invoices',
      '/accounts/5820%2F..%2Finvoices', '/accounts/%35', '//evil.example/accounts/1', '//accounts/1', '/accounts//1', 'https://evil.example/accounts/1', 'http://restapi.e-conomic.com/accounts/1',
      '/ACCOUNTS/5820', '/Accounts/5820', '/accounting-Years', '/accounts/-1', '/accounts/1.5', '/accounts/1e3', '/accounts/٥', '/accounts/5820\n', '\n/accounts/5820', '/accounts/5820\r\n/invoices', ' /accounts/5820',
      '/accounts\\5820', '/accounts/5820;x', '/accounts/1234567890123456789', 'accounts/5820', '', '/', '/self', '/accounts', '/customers', '/customers/1', '/suppliers', '/invoices/booked', '/invoices/drafts', '/journals',
      '/accounting-years/2024/2025/entries', '/accounting-years/24/entries', '/accounting-years/20241/entries', '/accounting-years/2024/entries/1', '/accounting-years/2024/totals', '/accounting-years/2024/entries?filter=1', '/accounting-years/2024/periods', '/accounting-years/2024/vouchers', '/accounting-years/2024/entries/', '/booked-entries',
    ]
    for (const p of bypass) t(`afvist: ${JSON.stringify(p)}`, !economicReadPathAllowed(p))
    t('afvist: ikke-tekst', !economicReadPathAllowed(undefined as unknown as string) && !economicReadPathAllowed(['/accounts/1'] as unknown as string))

    mockFetch(json(ACCOUNT))
    for (const p of bypass) {
      const r = await economicGetWithSettings(ready, p)
      if (r.ok) t(`klienten afviser ${JSON.stringify(p)}`, false)
    }
    t('en afvist sti når aldrig fetch', calls.length === 0, `kald=${calls.length}`)

    // ---------- GET-klienten
    mockFetch(json(ACCOUNT))
    const read1 = await economicGetWithSettings(ready, '/accounts/5820')
    t('kun GET mod e-conomics adresse', calls.length === 1 && calls[0].method === 'GET' && calls[0].url === 'https://restapi.e-conomic.com/accounts/5820' && calls[0].body === undefined)
    t('tokens sendes som headere og ikke i adressen', calls[0].headers['X-AppSecretToken'] === SECRET_A && !calls[0].url.includes(SECRET_A) && !calls[0].url.includes(SECRET_B))
    t('tokens er ikke i svaret', !JSON.stringify(read1).includes(SECRET_A) && !JSON.stringify(read1).includes(SECRET_B))
    const clientSrc = readFileSync(new URL('../src/lib/services/economic-client.ts', import.meta.url), 'utf8')
    const getSrc = clientSrc.slice(clientSrc.indexOf('export async function economicGetWithSettings'), clientSrc.indexOf('// Phase 15'))
    t('læseklienten kan kun GET', getSrc.includes("method: 'GET'") && !/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(getSrc) && !getSrc.includes('body:'))
    t('læseklienten skriver hverken log eller last_sync_at', !getSrc.includes('logAttempt') && !getSrc.includes('last_sync_at') && !getSrc.includes(".from('"))
    t('ingen fil økonomi-koden kalder en skrivefunktion', !/createInvoiceInEconomic|createCustomerInEconomic|markInvoicePaid|pushSupplierInvoice|method:\s*'POST'/.test(['src/lib/finance/finance-desk.ts', 'src/lib/finance/cash-position.ts', 'src/lib/finance/position.ts', 'src/lib/economic/read.ts', 'src/lib/economic/read-model.ts', 'src/lib/economic/supplier-remainder.ts', 'src/lib/actions/finance-position.ts', 'src/app/dashboard/finance/page.tsx'].map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n')))

    // ---------- saldo: nul, fejl, timeout, forkert svar
    delete process.env.ECONOMIC_PUSH_ENABLED
    mockFetch(json({ ...ACCOUNT, balance: 0 }))
    const zero = await readBankAccountBalance(ready, 5820)
    t('rigtig saldo 0 er 0', zero.state === 'known' && zero.amount === 0)
    t('GET virker med kill-switchen fra', calls.length === 1)

    mockFetch(json({ ...ACCOUNT, balance: -50.25 }))
    const neg = await readBankAccountBalance(ready, 5820)
    t('negativ saldo bevares', neg.state === 'known' && neg.amount === -50.25)

    for (const [label, data] of [
      ['ingen saldo', { ...ACCOUNT, balance: undefined }], ['saldo null', { ...ACCOUNT, balance: null }], ['saldo som tekst', { ...ACCOUNT, balance: '100' }],
      ['andet kontonummer', { ...ACCOUNT, accountNumber: 1 }], ['ingen kontotype', { ...ACCOUNT, accountType: undefined }], ['fejlsvar med 200', { message: 'nej' }], ['liste', [1]],
    ] as Array<[string, unknown]>) {
      mockFetch(json(data))
      const r = await readBankAccountBalance(ready, 5820)
      t(`forkert svar er ukendt: ${label}`, r.state === 'unknown' && r.reason === 'missing_balance', JSON.stringify(r))
    }
    mockFetch(() => ({ status: 200, body: '<html>ikke json</html>' }))
    t('HTML er ukendt', (await readBankAccountBalance(ready, 5820)).state === 'unknown')
    mockFetch(() => ({ status: 200, body: '' }))
    t('tomt svar er ukendt', (await readBankAccountBalance(ready, 5820)).state === 'unknown')

    mockFetch(json({ ...ACCOUNT, accountType: 'profitAndLoss' }))
    const pnl = await readBankAccountBalance(ready, 5820)
    t('driftskonto vises ikke som kasse', pnl.state === 'unknown' && pnl.reason === 'not_balance_sheet')
    t('parse: 0 på statuskonto', parseLedgerAccount({ ...ACCOUNT, balance: 0 }, 5820).state === 'known')

    for (const status of [401, 403, 404, 429, 500, 503]) {
      mockFetch(json({ message: `rå fejl ${SECRET_A}`, developerHint: SECRET_B }, status))
      const raw = await economicGetWithSettings(ready, '/accounts/5820')
      t(`HTTP ${status} er fejl uden rå tekst`, !raw.ok && raw.reason === 'failed' && !JSON.stringify(raw).includes('HEMMELIG'), JSON.stringify(raw))
      const r = await readBankAccountBalance(ready, 5820)
      t(`HTTP ${status} er ukendt`, r.state === 'unknown' && r.reason === 'failed')
    }
    mockFetch(() => 'throw')
    const netErr = await economicGetWithSettings(ready, '/accounts/5820')
    t('netværksfejl lækker ikke den rå fejl', !netErr.ok && netErr.reason === 'failed' && !JSON.stringify(netErr).includes('HEMMELIG'))

    const realSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 5)) as unknown as typeof setTimeout
    mockFetch(() => 'hang')
    const timedOut = await readBankAccountBalance(ready, 5820)
    globalThis.setTimeout = realSetTimeout
    t('timeout er ukendt og timeout', timedOut.state === 'unknown' && timedOut.reason === 'timeout', JSON.stringify(timedOut))
    t('timeout: ét kald, intet genforsøg', calls.length === 1)

    // ---------- paginering
    t('næste side = ikke komplet', parseCollection({ collection: [1], pagination: { nextPage: 'x' } }, 100)?.complete === false)
    t('fuld side = ikke komplet', parseCollection({ collection: new Array(100).fill(0) }, 100)?.complete === false)
    t('kort side uden næste = komplet', parseCollection({ collection: [1], pagination: {} }, 100)?.complete === true)
    t('collection som ikke-liste er ingen liste', parseCollection({ collection: 'x' }, 100) === null)
    mockFetch(json({ collection: [{ year: '2026' }], pagination: { nextPage: 'x' } }))
    const years = await readAccountingYears(ready)
    t('sonden melder ikke-komplet', years.ok === true && years.complete === false)
    mockFetch(json({ message: 'nej' }))
    t('sonden: forkert svar er fejl', (await readAccountingYears(ready)).ok === false)

    // ---------- skrivebordet med rigtige rettigheder
    const fullTables = { invoices: { data: [INVOICE_ROW] }, customers: { data: [{ id: 'c1', company_name: 'Kunde' }] }, incoming_invoices: { data: [] }, bank_transactions: { count: 2 } }
    const bog = () => ctxFor('bogholderi', fullTables)

    {
      const { ctx, reads } = ctxFor('montør', fullTables)
      const { deps, seen } = depsFor()
      mockFetch(json(ACCOUNT))
      const r = await buildFinanceDesk(ctx, deps, NOW)
      t('montør afvises', r.ok === false)
      t('montør: ingen forespørgsel, ingen indstillinger, ingen e-conomic', reads.length === 0 && seen.settings === 0 && calls.length === 0, reads.join(','))
      t('montør ingen økonominøgler', !hasPermission('montør', 'economy.view') && !hasPermission('montør', 'settings.economic') && !hasPermission('montør', 'incoming_invoices.view') && !hasPermission('montør', 'bank.view') && !hasPermission('montør', 'invoices.view.all') && !hasPermission('montør', 'invoices.view.own_cases'))
    }
    {
      const { ctx, reads } = ctxFor('salg', fullTables)
      const { deps, seen } = depsFor()
      const r = await buildFinanceDesk(ctx, deps, NOW)
      t('salg afvises', r.ok === false && reads.length === 0 && seen.settings === 0)
    }
    {
      const { ctx, reads } = ctxFor('montør', fullTables, ['economy.view'])
      const { deps, seen } = depsFor()
      mockFetch(json(ACCOUNT))
      const r = await buildFinanceDesk(ctx, deps, NOW)
      t('kun economy.view-grant: ingen fakturaer, leverandører, bank eller e-conomic', r.ok === true && !r.seesInvoices && !r.seesPayables && !r.seesEconomic && !r.bank.visible && reads.length === 0 && seen.settings === 0 && calls.length === 0, reads.join(','))
      if (r.ok) {
        t('skjult er ikke en læsefejl', r.cash.openReceivables.source === 'unavailable' && r.cash.alerts.length === 0, JSON.stringify(r.cash.alerts))
        t('kun economy.view-grant: ingen beløb i svaret', r.cash.openReceivables.amount === null && r.position.invoices.length === 0 && r.position.payables.length === 0)
      }
    }
    {
      const { ctx, reads } = ctxFor('serviceleder', fullTables)
      const { deps, seen } = depsFor()
      mockFetch(json(ACCOUNT))
      const r = await buildFinanceDesk(ctx, deps, NOW)
      t('serviceleder: economy.view uden settings.economic', hasPermission('serviceleder', 'economy.view') && !hasPermission('serviceleder', 'settings.economic'))
      t('serviceleder: indstillinger læses ikke, e-conomic kaldes ikke', seen.settings === 0 && seen.balance === 0 && seen.years === 0 && calls.length === 0)
      t('serviceleder: ser fakturaer, ikke bank', r.ok === true && r.seesInvoices && r.seesPayables && !r.seesEconomic && !r.bank.visible && !reads.includes('bank_transactions'))
      if (r.ok) {
        t('serviceleder: saldo er ukendt, ikke 0 og ikke opsætning', formatQualifiedKr(r.cash.bookedBankBalance) === 'Ukendt' && r.cash.bookedBankBalance.source === 'unavailable')
        t('serviceleder: ingen tokens i svaret', !JSON.stringify(r).includes('HEMMELIG'))
        t('serviceleder: åbent beløb 750', r.cash.openReceivables.amount === 750)
      }
    }
    {
      const grant = ctxFor('serviceleder', fullTables, ['settings.economic'])
      const { deps, seen } = depsFor()
      mockFetch(json(ACCOUNT))
      const r = await buildFinanceDesk(grant.ctx, deps, NOW)
      t('effektiv grant: settings.economic giver læsning', r.ok === true && r.seesEconomic && seen.settings === 1 && seen.balance === 1)
      const minus = ctxFor('admin', fullTables, [], ['settings.economic'])
      const m = depsFor()
      await buildFinanceDesk(minus.ctx, m.deps, NOW)
      t('effektivt fravalg: admin uden settings.economic læser ikke', m.seen.settings === 0)
      const noEconomy = ctxFor('admin', fullTables, [], ['economy.view'])
      const ne = depsFor()
      t('effektivt fravalg: admin uden economy.view afvises', (await buildFinanceDesk(noEconomy.ctx, ne.deps, NOW)).ok === false && noEconomy.reads.length === 0)
    }
    {
      const { ctx } = bog()
      const { deps } = depsFor()
      mockFetch(json({ ...ACCOUNT, balance: 0 }))
      const r = await buildFinanceDesk(ctx, deps, NOW)
      t('bogholderi: saldo 0 vises som 0,00 kr', r.ok === true && r.cash.bookedBankBalance.amount === 0 && r.cash.bookedBankBalance.source === 'economic_ledger' && formatQualifiedKr(r.cash.bookedBankBalance) === zeroKr)
      if (r.ok) {
        t('læsetidspunkt er denne visning', r.cash.economicReadAt === NOW.toISOString())
        t('kontonavn vises og saldoen kaldes ikke banksaldo', r.cash.bookedBankBalance.detail.includes('(Bank)') && r.cash.bookedBankBalance.detail.includes('Ikke en faktisk banksaldo'))
        t('faktisk banksaldo opfindes ikke', r.cash.actualBankBalance.amount === null && r.cash.actualBankBalance.source === 'unavailable' && formatQualifiedKr(r.cash.actualBankBalance) === 'Ukendt')
        t('kreditorer ukendte selv med 0 fakturaer', r.cash.openPayables.amount === null && r.cash.overduePayables.amount === null && formatQualifiedKr(r.cash.openPayables) === 'Ukendt')
        t('forventet likviditet ukendt når kreditor er ukendt', [r.cash.forecast30, r.cash.forecast60, r.cash.forecast90].every((h) => h.projectedCash.amount === null && formatQualifiedKr(h.projectedCash) === 'Ukendt'))
        t('ikke summeret fra bankbevægelser', r.bank.visible && r.bank.unmatched === 2 && r.cash.bookedBankBalance.amount === 0)
        t('ingen tokens i svaret', !JSON.stringify(r).includes('HEMMELIG'))
      }
    }
    {
      const { ctx } = bog()
      for (const [label, data, status, want] of [
        ['HTTP 500', { message: 'x' }, 500, 'error'], ['manglende saldo', { ...ACCOUNT, balance: null }, 200, 'error'], ['driftskonto', { ...ACCOUNT, accountType: 'profitAndLoss' }, 200, 'configuration_required'],
      ] as Array<[string, unknown, number, string]>) {
        const { deps } = depsFor()
        mockFetch(json(data, status))
        const r = await buildFinanceDesk(ctx, deps, NOW)
        t(`skrivebord: ${label} → ${want}, aldrig 0`, r.ok === true && r.cash.bookedBankBalance.source === want && r.cash.bookedBankBalance.amount === null && formatQualifiedKr(r.cash.bookedBankBalance) !== zeroKr && r.cash.economicReadAt === null, r.ok ? r.cash.bookedBankBalance.source : '')
      }
      const thrown = depsFor()
      thrown.deps.readBalance = async () => { throw new Error('boom') }
      const r2 = await buildFinanceDesk(ctx, thrown.deps, NOW)
      t('kastet læsefejl fælder ikke siden', r2.ok === true && r2.cash.bookedBankBalance.source === 'error')

      const missing = depsFor({ state: 'missing' })
      mockFetch(json(ACCOUNT))
      const r3 = await buildFinanceDesk(ctx, missing.deps, NOW)
      t('ingen opsætning: Ikke konfigureret, intet kald', r3.ok === true && r3.cash.bookedBankBalance.source === 'configuration_required' && formatQualifiedKr(r3.cash.bookedBankBalance) === 'Ikke konfigureret' && calls.length === 0)
      if (r3.ok) t('ikke konfigureret: forventet er Ukendt, ikke "ikke konfigureret"', formatQualifiedKr(r3.cash.forecast30.projectedCash) === 'Ukendt')
      if (r3.ok) t('ikke konfigureret giver en advarsel', r3.cash.alerts.some((a) => a.code === 'bank_configuration_required'))

      const errored = depsFor({ state: 'error' })
      mockFetch(json(ACCOUNT))
      const r4 = await buildFinanceDesk(ctx, errored.deps, NOW)
      t('fejlet indstillingslæsning er fejl, ikke "ikke opsat"', r4.ok === true && r4.cash.bookedBankBalance.source === 'error' && formatQualifiedKr(r4.cash.bookedBankBalance) === 'Ukendt' && calls.length === 0)

      const noTokens = depsFor({ state: 'found', settings: { ...ready, api_token: null } as never })
      mockFetch(json(ACCOUNT))
      const r5 = await buildFinanceDesk(ctx, noTokens.deps, NOW)
      t('ingen nøgler: ikke konfigureret, intet kald', r5.ok === true && r5.cash.bookedBankBalance.source === 'configuration_required' && calls.length === 0)
      t('isEconomicReady kræver begge nøgler og aktiv', !isEconomicReady({ ...ready, active: false } as never) && !isEconomicReady({ ...ready, agreement_grant_token: null } as never))

      const noAccount = depsFor({ state: 'found', settings: { ...ready, config: {} } as never })
      mockFetch(json({ collection: [] }))
      const r6 = await buildFinanceDesk(ctx, noAccount.deps, NOW)
      t('ingen bankkonto valgt: ikke konfigureret, intet hardkodet nummer', r6.ok === true && r6.cash.bookedBankBalance.source === 'configuration_required' && calls.every((c) => !c.url.includes('/accounts/')))
      const textAccount = depsFor({ state: 'found', settings: { ...ready, config: { bankContraAccountNumber: '5820' } } as never })
      mockFetch(json({ collection: [] }))
      const r7 = await buildFinanceDesk(ctx, textAccount.deps, NOW)
      t('kontonummer som tekst bruges ikke', r7.ok === true && r7.cash.bookedBankBalance.source === 'configuration_required' && calls.every((c) => !c.url.includes('/accounts/')))
      const probeDown = depsFor({ state: 'found', settings: { ...ready, config: {} } as never })
      mockFetch(json({ message: 'x' }, 500))
      const r8 = await buildFinanceDesk(ctx, probeDown.deps, NOW)
      t('sonden fejler: fejl, ikke 0', r8.ok === true && r8.cash.bookedBankBalance.source === 'error')
    }

    // ---------- CRM-læsefejl
    {
      const failing = ctxFor('bogholderi', { ...fullTables, invoices: { error: { message: 'rls' } }, incoming_invoices: { error: { message: 'rls' } } })
      const { deps } = depsFor()
      mockFetch(json(ACCOUNT))
      console.error = () => {}
      const r = await buildFinanceDesk(failing.ctx, deps, NOW)
      console.error = realConsoleError
      t('fejlet fakturalæsning er Ukendt, ikke 0', r.ok === true && r.cash.openReceivables.source === 'error' && r.cash.openReceivables.amount === null && formatQualifiedKr(r.cash.openReceivables) === 'Ukendt')
      t('fejlet leverandørlæsning er fejl', r.ok === true && r.cash.openPayables.source === 'error')
      t('fejlet læsning giver en advarsel, ikke nul advarsler', r.ok === true && r.cash.alerts.some((a) => a.code === 'finance_read_failed'))
      if (r.ok) t('fejlet læsning: horisonten er Ukendt', formatQualifiedKr(r.cash.forecast30.expectedIncoming) === 'Ukendt' && formatQualifiedKr(r.cash.forecast30.projectedCash) === 'Ukendt')
      const bankDown = ctxFor('bogholderi', { ...fullTables, bank_transactions: { error: { message: 'x' } } })
      const b = await buildFinanceDesk(bankDown.ctx, depsFor().deps, NOW)
      t('fejlet bankoptælling er ukendt, ikke 0', b.ok === true && b.bank.visible && b.bank.unmatched === null)
      const namesDown = ctxFor('bogholderi', { ...fullTables, customers: { error: { message: 'x' } } })
      const n = await buildFinanceDesk(namesDown.ctx, depsFor().deps, NOW)
      t('fejlede kundenavne fjerner ikke beløbet', n.ok === true && !n.customerNamesKnown && n.cash.openReceivables.amount === 750)
    }

    // ---------- dashboard-kortet
    {
      const tile = (role: UserRole, read: EconomicSettingsRead, tables = fullTables as Record<string, { data?: unknown; error?: unknown }>) => {
        const { ctx, reads } = ctxFor(role, tables)
        let settings = 0
        return { run: () => buildFinanceAlertTile(ctx, async () => { settings++; return read }, NOW), reads, settingsCount: () => settings }
      }
      const withThreshold = (n: number): EconomicSettingsRead => ({ state: 'found', settings: { ...ready, config: { bankContraAccountNumber: 5820, overdueReceivablesAlertDkk: n } } as never })
      mockFetch(json(ACCOUNT))
      const s = tile('serviceleder', withThreshold(1))
      t('kort: serviceleder uden settings.economic er skjult, læser intet', (await s.run()).state === 'hidden' && s.settingsCount() === 0 && s.reads.length === 0)
      const mon = tile('montør', withThreshold(1))
      t('kort: montør er skjult, læser intet', (await mon.run()).state === 'hidden' && mon.settingsCount() === 0 && mon.reads.length === 0)
      const none = tile('bogholderi', { state: 'found', settings: ready })
      t('kort: uden grænse er det skjult (intet er vurderet), ingen fakturalæsning', (await none.run()).state === 'hidden' && none.reads.length === 0)
      const missing = tile('bogholderi', { state: 'missing' })
      t('kort: ingen opsætning er skjult', (await missing.run()).state === 'hidden' && missing.reads.length === 0)
      const errored = tile('bogholderi', { state: 'error' })
      t('kort: fejlet indstillingslæsning er Ukendt', (await errored.run()).state === 'unknown')
      const failing = tile('bogholderi', withThreshold(1), { ...fullTables, invoices: { error: { message: 'x' } } })
      console.error = () => {}
      const fr = await failing.run()
      console.error = realConsoleError
      t('kort: fejlet fakturalæsning er Ukendt, ikke 0', fr.state === 'unknown')
      const nullAmount = tile('bogholderi', withThreshold(1), { ...fullTables, invoices: { data: [{ ...INVOICE_ROW, final_amount: null }] } })
      t('kort: ukendt beløb er Ukendt', (await nullAmount.run()).state === 'unknown')
      const over = tile('bogholderi', withThreshold(100))
      const o = await over.run()
      t('kort: over grænsen = 1', o.state === 'ok' && o.count === 1)
      const under = tile('bogholderi', withThreshold(10_000))
      const u = await under.run()
      t('kort: under grænsen = 0, fordi tjekket kørte', u.state === 'ok' && u.count === 0)
      t('kort: kalder aldrig e-conomic', calls.length === 0, `kald=${calls.length}`)
    }

    // ---------- tilgodehavender mod den kanoniske regel
    const rows: Array<InvoiceTotalsRow & { invoice_number: string }> = [
      { id: 'a', invoice_number: 'A', invoice_type: 'standard', status: 'sent', final_amount: 1000, amount_paid: 250.5, currency: 'DKK', due_date: '2026-10-01' },
      { id: 'b', invoice_number: 'B', invoice_type: 'standard', status: 'sent', final_amount: '2000.10', amount_paid: 0, currency: 'dkk', due_date: today },
      { id: 'c', invoice_number: 'C', invoice_type: 'standard', status: 'paid', final_amount: 500, amount_paid: 0, currency: 'DKK', due_date: '2026-09-01' },
      { id: 'd', invoice_number: 'D', invoice_type: 'standard', status: 'sent', final_amount: 700, amount_paid: 0, currency: 'DKK', due_date: '2026-10-01', voided_at: '2026-10-10' },
      { id: 'e', invoice_number: 'E', invoice_type: 'standard', status: 'draft', final_amount: 900, amount_paid: 0, currency: 'DKK', due_date: '2026-10-01' },
      { id: 'f', invoice_number: 'F', invoice_type: 'standard', status: 'sent', final_amount: 1000, amount_paid: 0, currency: null, due_date: '2026-10-15' },
      { id: 'f-kredit', invoice_number: 'FK', invoice_type: 'credit', status: 'sent', final_amount: -400, amount_paid: 0, currency: 'DKK', credit_of_invoice_id: 'f' },
      { id: 'f-annulleret', invoice_number: 'FA', invoice_type: 'credit', status: 'sent', final_amount: -300, amount_paid: 0, currency: 'DKK', credit_of_invoice_id: 'f', voided_at: '2026-10-20' },
      { id: 'f-kladde', invoice_number: 'FD', invoice_type: 'credit', status: 'draft', final_amount: -200, amount_paid: 0, currency: 'DKK', credit_of_invoice_id: 'f' },
      { id: 'g', invoice_number: 'G', invoice_type: 'standard', status: 'sent', final_amount: 100, amount_paid: 0, currency: 'EUR', due_date: '2026-10-01' },
      { id: 'h', invoice_number: 'H', invoice_type: 'standard', status: 'sent', final_amount: 0.3, amount_paid: 0, currency: 'DKK', due_date: '2026-10-01' },
      { id: 'i', invoice_number: 'I', invoice_type: 'standard', status: 'sent', final_amount: 100, amount_paid: 150, currency: 'DKK', due_date: '2026-10-01' },
      { id: 'j', invoice_number: 'J', invoice_type: 'standard', status: 'sent', final_amount: 80, amount_paid: 0, currency: 'DKK', due_date: null },
    ]
    const asInput = (r: (typeof rows)[number]): ReceivableInput => ({
      id: r.id, invoiceNumber: r.invoice_number, customerId: null, customerName: null, status: r.status as string, invoiceType: (r.invoice_type as string) ?? null,
      voidedAt: (r.voided_at as string | null) ?? null, currency: (r.currency as string | null) ?? null, finalAmount: r.final_amount as number, amountPaid: r.amount_paid as number,
      dueDate: (r.due_date as string | null) ?? null, creditOfInvoiceId: (r.credit_of_invoice_id as string | null) ?? null,
    })
    const canonical = computeInvoiceTotals(rows, NOW.getTime())
    const position = buildFinancePosition({ today, receivablesLoaded: true, payablesLoaded: true, invoices: rows.map(asInput), payables: [] })
    t('tilgodehavender = kanonisk udestående', position.receivables.state === 'known' && Math.abs(position.receivables.amount - canonical.outstanding) < 0.005, `${JSON.stringify(position.receivables)} / ${canonical.outstanding}`)
    t('forfaldne = kanonisk', position.overdueAmount.state === 'known' && Math.abs(position.overdueAmount.amount - canonical.overdueSum) < 0.005 && position.overdueCount === canonical.overdueCount, `${JSON.stringify(position.overdueAmount)} / ${canonical.overdueSum}`)
    t('anden valuta = kanonisk og ikke i kroner', position.otherCurrencyCount === canonical.otherCurrencyCount && position.otherCurrencyCount === 1)
    t('annulleret kreditnota og kladde modregnes ikke', canonical.overdue.find((o) => o.id === 'f')?.open === 600 && position.invoices.find((o) => o.id === 'f')?.amount === 600)
    t('overbetalt er ikke negativ', !position.invoices.some((o) => o.id === 'i'))

    // valuta og manglende beløb
    const mixed = buildFinancePosition({ today, receivablesLoaded: true, payablesLoaded: true, payables: [], invoices: [
      asInput({ ...rows[0], id: 'dkk', final_amount: 100, amount_paid: 0, currency: 'DKK', due_date: '2026-11-10' }),
      asInput({ ...rows[0], id: 'eur', final_amount: 999, amount_paid: 0, currency: 'EUR', due_date: '2026-11-10' }),
      asInput({ ...rows[0], id: 'sek', final_amount: 888, amount_paid: 0, currency: 'sek', due_date: null }),
    ] })
    t('valuta blandes ikke som DKK', mixed.receivables.state === 'known' && mixed.receivables.amount === 100 && mixed.otherCurrencyCount === 2)
    const d30 = mixed.forecast.find((w) => w.id === 'd30')?.inflow
    t('valuta i horisonten blandes ikke', d30?.state === 'known' && d30.amount === 100)
    const paidNull = buildFinancePosition({ today, receivablesLoaded: true, payablesLoaded: true, payables: [], invoices: [asInput({ ...rows[0], amount_paid: null as never })] })
    t('manglende indbetalt er ukendt, ikke 0', paidNull.receivables.state === 'unknown' && paidNull.overdueAmount.state === 'unknown')
    const creditNull = buildFinancePosition({ today, receivablesLoaded: true, payablesLoaded: true, payables: [], invoices: [
      asInput({ ...rows[0], id: 'o' }),
      asInput({ ...rows[6], id: 'k', final_amount: null as never, credit_of_invoice_id: 'o' }),
    ] })
    t('ulæselig kreditnota gør åbent ukendt', creditNull.receivables.state === 'unknown')

    // manglende forfaldsdato
    const undated = buildCashPosition({ today, calculatedAt: NOW.toISOString(), receivablesLoaded: true, payablesLoaded: true, payables: [], invoices: [asInput({ ...rows[0], id: 'u', final_amount: 80, amount_paid: 0, due_date: null })],
      bank: { permitted: true, credentialsReady: true, accountNumber: 1, probe: 'not_needed', balance: { outcome: 'known', amount: 100 }, readAt: NOW.toISOString() } })
    t('uden forfald: i tilgodehavender, ikke i horisonter', undated.openReceivables.amount === 80 && undated.forecast90.expectedIncoming.amount === 0 && undated.forecast30.unscheduledReceivables.amount === 80)
    t('uden forfald: ikke forfalden', undated.overdueReceivables.amount === 0 && undated.ledger.missingDueCount === 1)
    t('ukendt beløb i et vindue gør kun det vindues horisont ukendt', forecastBucket(null, today) === 'undated')

    // datogrænser
    t('dag 0 i 30', forecastBucket(today, today) === 'd30')
    t('i går er forfalden', forecastBucket('2026-11-03', today) === 'overdue')
    t('dag 30 i 30', forecastBucket('2026-12-04', today) === 'd30')
    t('dag 31 i 60', forecastBucket('2026-12-05', today) === 'd60')
    t('dag 60 i 60', forecastBucket('2027-01-03', today) === 'd60')
    t('dag 61 i 90', forecastBucket('2027-01-04', today) === 'd90')
    t('dag 90 i 90', forecastBucket('2027-02-02', today) === 'd90')
    t('dag 91 efter', forecastBucket('2027-02-03', today) === 'later')
    t('tid på due_date tæller ikke som senere dag', position.invoices.every((o) => o.id !== 'b'))
    t('skuddag og årsskifte', forecastBucket('2028-03-30', '2028-02-29') === 'd30' && forecastBucket('2028-03-31', '2028-02-29') === 'd60')
    t('sommertid: 30 dage er kalenderdage', forecastBucket('2026-11-24', '2026-10-25') === 'd30' && forecastBucket('2026-11-25', '2026-10-25') === 'd60')
    t('dagen er dansk: 23.30 UTC er næste dag', copenhagenParts(new Date('2026-11-04T23:30:00Z')).date === '2026-11-05')
    {
      const late = new Date('2026-11-04T23:30:00Z')
      const { ctx } = ctxFor('bogholderi', { ...fullTables, invoices: { data: [{ ...INVOICE_ROW, due_date: '2026-11-04' }] } })
      const r = await buildFinanceDesk(ctx, depsFor({ state: 'missing' }).deps, late)
      t('forfald i går efter dansk midnat er forfalden', r.ok === true && r.cash.overdueReceivables.amount === 750)
      const { ctx: ctx2 } = ctxFor('bogholderi', { ...fullTables, invoices: { data: [{ ...INVOICE_ROW, due_date: '2026-11-05' }] } })
      const r2 = await buildFinanceDesk(ctx2, depsFor({ state: 'missing' }).deps, late)
      t('forfald i dag efter dansk midnat er ikke forfalden', r2.ok === true && r2.cash.overdueReceivables.amount === 0)
    }

    // 0 / Ukendt / Ikke konfigureret
    t('0 kr', formatQualifiedKr({ source: 'economic_ledger', amount: 0, detail: '' }) === zeroKr)
    t('fejl med efterladt 0 er Ukendt', formatQualifiedKr({ source: 'error', amount: 0, detail: '' }) === 'Ukendt')
    t('ikke tilgængelig med efterladt 0 er Ukendt', formatQualifiedKr({ source: 'unavailable', amount: 0, detail: '' }) === 'Ukendt')
    t('ikke konfigureret med efterladt 0', formatQualifiedKr({ source: 'configuration_required', amount: 0, detail: '' }) === 'Ikke konfigureret')
    t('projektion: 0 + 0 − 0 er 0, når alt er kendt', projectCash({ source: 'economic_ledger', amount: 0, detail: '' }, { source: 'crm_open_items', amount: 0, detail: '' }, { source: 'crm_open_items', amount: 0, detail: '' }).amount === 0)
    t('projektion: fejl er fejl', projectCash({ source: 'error', amount: null, detail: '' }, { source: 'crm_open_items', amount: 1, detail: '' }, { source: 'unavailable', amount: null, detail: '' }).source === 'error')

    // ingen scope-sammenblanding og ingen falsk "stale"
    {
      const own = ctxFor('salg', fullTables, ['economy.view', 'settings.economic'])
      const { deps } = depsFor({ state: 'found', settings: { ...ready, config: { bankContraAccountNumber: 5820, overdueReceivablesAlertDkk: 1 } } as never })
      mockFetch(json(ACCOUNT))
      const r = await buildFinanceDesk(own.ctx, deps, NOW)
      t('scope-bruger: firmagrænse sammenlignes ikke med egne sager', r.ok === true && !r.scopeAll && !r.cash.alerts.some((a) => a.code === 'overdue_receivables_above_threshold'))
    }
    const cashSrc = readFileSync(new URL('../src/lib/finance/cash-position.ts', import.meta.url), 'utf8')
    t('ingen uopnåelig stale-kode', !cashSrc.includes("'stale'") && !cashSrc.includes('FINANCE_STALE_MS'))

    // kun design: ingen import af bogførings-/lønmodulerne
    const designFiles = ['src/lib/finance/bookkeeping-design.ts', 'src/lib/finance/payroll-design.ts']
    for (const f of designFiles) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
      t(`${f}: uden import og netværk`, !/^import /m.test(src) && !src.includes('fetch(') && !src.includes('supabase'))
    }
    t('ECONOMIC_DEPS bruger de rigtige læsere', ECONOMIC_DEPS.readBalance === readBankAccountBalance && ECONOMIC_DEPS.readYears === readAccountingYears)
    t('intet sender besked fra alert-koden', !/sendEmail|sendSms|telegram|customer_tasks/i.test(readFileSync(new URL('../src/lib/finance/finance-desk.ts', import.meta.url), 'utf8') + cashSrc))
  } finally {
    globalThis.fetch = realFetch
    console.error = realConsoleError
  }
  console.log(bad ? `❌ ${bad} fejl, ${passed} bestået` : `grok-finance-1-review-test ok (${passed} bestået)`)
  process.exit(bad ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
