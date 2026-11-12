/**
 * TEST-ONLY preload for the ui-e2e Next server (UI_ECONOMIC_MOCK=1). Never imported by product code.
 * Loaded with `node --import` into the test server only (not the build).
 *
 * - Intercepts every request to restapi.e-conomic.com and to *.example hosts. Nothing leaves the machine.
 *   Responses follow the official classic REST shapes (collection + pagination, account resource).
 * - Intercepts ONLY the server's GET of accounting_integration_settings (PostgREST) while a scenario is active, and
 *   returns a fake, non-secret settings row. Staging data is never written.
 * - Every intercepted request is appended to UI_ECONOMIC_MOCK_LOG (method, host, path, query, body flag) so the test
 *   can prove: GET only, allowlisted paths, which persona caused a read, no nextPage followed, no write.
 * The scenario is read per request from UI_ECONOMIC_MOCK_SCENARIO (a file the test rewrites between page loads).
 */
import { appendFileSync, readFileSync } from 'node:fs'

const LOG = process.env.UI_ECONOMIC_MOCK_LOG
const SCENARIO_FILE = process.env.UI_ECONOMIC_MOCK_SCENARIO
const realFetch = globalThis.fetch
const BANK = 5820

function scenario() {
  try { return readFileSync(SCENARIO_FILE, 'utf8').trim() } catch { return '' }
}
function log(entry) {
  if (LOG) appendFileSync(LOG, `${JSON.stringify({ t: Date.now(), ...entry })}\n`)
}
function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date())
}
function due(days) {
  const d = new Date(`${today()}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const page = (rows, extra = {}) => json({ collection: rows, pagination: { results: rows.length, ...extra } })
const sup = (n, remainder, dueDate, extra = {}) => ({
  entryNumber: n, entryType: 'supplierInvoice', currency: 'DKK', remainder, amount: remainder * 2, dueDate,
  supplier: { supplierNumber: 7 }, supplierInvoiceNumber: `MOCK-${n}`, ...extra,
})

const YEAR = () => today().slice(0, 4)
const PREV = () => String(Number(today().slice(0, 4)) - 1)

/** Entries per scenario and year. Customer open items and contra lines are always present to prove they are ignored. */
function entries(name, year) {
  const noise = [
    { entryNumber: 900, entryType: 'customerInvoice', currency: 'DKK', remainder: 12345, dueDate: due(5), customer: { customerNumber: 1 }, supplier: null },
    { entryNumber: 901, entryType: 'financeVoucher', currency: 'DKK', remainder: null, supplier: null },
  ]
  if (year !== YEAR()) {
    if (name === 'crossyear') return [sup(1, -300, due(-200))]
    return []
  }
  switch (name) {
    case 'known': return [...noise, sup(1, -400, due(20)), sup(2, -100, due(10), { entryType: 'financeVoucher', supplierInvoiceNumber: null }), sup(3, -50, due(40), { entryType: 'systemEntry', supplierInvoiceNumber: null })]
    case 'empty': return [...noise]
    case 'foreign': return [...noise, sup(1, -400, due(20)), sup(2, -50, due(20), { currency: 'EUR' })]
    case 'unattributable': return [...noise, sup(1, -400, due(20)), { entryNumber: 3, entryType: 'financeVoucher', currency: 'DKK', remainder: -250, dueDate: due(5), supplier: null }]
    case 'undated': return [...noise, sup(1, -400, null)]
    case 'credit': return [...noise, sup(1, -100, due(10)), sup(2, 500, due(12), { supplierInvoiceNumber: 'CN-1' })]
    case 'crossyear': return [...noise, sup(5, -300, null, { entryType: 'transferredOpeningEntry', supplierInvoiceNumber: null })]
    default: return []
  }
}

function economic(url, method) {
  const name = scenario()
  if (method !== 'GET') return json({ message: 'mock: write refused' }, 405)
  if (url.pathname === '/accounting-years') {
    const years = name === 'crossyear' ? [{ year: PREV() }, { year: YEAR() }] : [{ year: YEAR() }]
    return page(years)
  }
  if (url.pathname === `/accounts/${BANK}`) return json({ accountNumber: BANK, accountType: 'status', balance: 10000, name: 'Bank (mock)' })
  const m = /^\/accounting-years\/(\d{4})\/entries$/.exec(url.pathname)
  if (m) {
    if (name === 'error') return json({ message: 'mock 503' }, 503)
    if (name === 'incomplete') {
      // a full page with a nextPage link to a foreign host: must be unknown, and the link must not be followed
      const rows = Array.from({ length: Number(url.searchParams.get('pagesize') || 1000) }, (_, i) => sup(i + 1, -1, due(5)))
      return page(rows, { results: 999999, nextPage: 'https://evil.example/steal' })
    }
    return page(entries(name, m[1]))
  }
  return json({ message: 'mock: unknown path' }, 404)
}

globalThis.fetch = async function mockedFetch(input, init) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url
  let url
  try { url = new URL(raw) } catch { return realFetch(input, init) }
  const method = String(init?.method ?? (typeof input === 'object' && input?.method) ?? 'GET').toUpperCase()
  const name = scenario()
  if (url.hostname === 'restapi.e-conomic.com' || url.hostname.endsWith('e-conomic.com') || url.hostname.endsWith('.example')) {
    log({ kind: 'economic', scenario: name, method, host: url.hostname, path: url.pathname, query: Object.fromEntries(url.searchParams), body: init?.body != null })
    if (url.hostname !== 'restapi.e-conomic.com') return json({ message: 'mock: foreign host' }, 404)
    return economic(url, method)
  }
  if (name && url.pathname === '/rest/v1/accounting_integration_settings') {
    log({ kind: 'settings', scenario: name, method, path: url.pathname })
    if (method !== 'GET' && method !== 'HEAD') return json({ message: 'mock: settings write refused' }, 405)
    const row = {
      id: '00000000-0000-4000-8000-0000000000e1', provider: 'economic', active: true,
      api_token: `p2mock-${name}`, agreement_grant_token: 'p2mock-grant', last_sync_at: null,
      config: { bankContraAccountNumber: BANK }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }
    const accept = String((init?.headers && (init.headers.get ? init.headers.get('accept') : init.headers.Accept ?? init.headers.accept)) ?? '')
    return accept.includes('vnd.pgrst.object') ? json(row) : json([row])
  }
  return realFetch(input, init)
}
