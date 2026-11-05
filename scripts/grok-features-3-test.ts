/**
 * Batch 3: indkøbsgennemgang, sager uden næste handling.
 * Ingen netværk og ingen database.
 * Kør: node node_modules/tsx/dist/cli.mjs scripts/grok-features-3-test.ts
 */
import { invoiceTrafficLight } from '../src/lib/invoice-control/traffic-light'
import type { InvoiceControl } from '../src/lib/invoice-control/engine'
import { duplicateProductLineNumbers, purchasingLinesForReview, unitPriceMovement } from '../src/lib/invoice-control/purchasing-review'
import { casesWithoutNextAction } from '../src/lib/operations/open-cases'
import { interpretCrmQuestion } from '../src/lib/assistant/crm-questions'
import { readFileSync } from 'node:fs'
import { readCasesWithoutNextAction } from '../src/lib/operations/open-cases'
import { invoiceDocumentNote, invoiceTextOrigin } from '../src/lib/invoice-control/invoice-document-note'
import { overdueTaskFilter } from '../src/lib/tasks/overdue-query'
import { caseAcceptsCatalogueMaterial } from '../src/lib/materials/catalogue-case-rules'

let bad = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`)
}

const clear: InvoiceControl = {
  verdict: 'ok',
  lines: [{ lineNumber: 1, description: 'Kabel', verdict: 'ok', varianceAmount: 0, variancePct: 0, reason: 'inden for tolerance' }],
  controlledLines: 1,
  totalLines: 1,
  coveragePct: 100,
  overchargeAmount: 0,
}
const base = { control: clear, caseId: 's1', purchaseOrderId: 'po' }

eq('1 kr på 10.000 kr er ikke en bevægelse', unitPriceMovement(10000, 9999).moved, false)
eq('10 % og 10 kr er en bevægelse', unitPriceMovement(110, 100), { moved: true, diff: 10 })
eq('10 % under 0,50 kr er afrunding', unitPriceMovement(1.1, 1).moved, false)
eq('ukendt pris bevæger sig ikke', unitPriceMovement(null, 100).moved, false)

const noisy = invoiceTrafficLight({
  ...base,
  purchasing: { lines: [{ lineNumber: 4, invoicedQty: 1, expectedQty: null, catalogueUnitPrice: 10000, previousUnitPrice: 9999, duplicate: false }] },
})
eq('1 kr alene gør ikke fakturaen gul', noisy.light, 'green')
eq('manglende forventet antal er ikke et fund', noisy.findings.some((f) => f.code === 'qty_expected_unknown'), false)

const moved = invoiceTrafficLight({
  ...base,
  purchasing: { lines: [{ invoicedQty: 2, expectedQty: 2, catalogueUnitPrice: 110, previousUnitPrice: 100, duplicate: false }] },
})
eq('ægte prisbevægelse er gul', moved.light, 'yellow')
eq('bevægelsen er pr. enhed', moved.findings.find((f) => f.code === 'price_movement')?.amount, 10)

const sameQty = invoiceTrafficLight({
  ...base,
  purchasing: { lines: [{ invoicedQty: 3, expectedQty: 3, catalogueUnitPrice: 40, previousUnitPrice: 40, duplicate: false }] },
})
eq('ens antal og pris bliver grøn', sameQty.light, 'green')

eq('samme vare to gange er en dublet', [...duplicateProductLineNumbers([
  { lineNumber: 1, productId: 'p', quantity: 2 },
  { lineNumber: 2, productId: 'p', quantity: 4 },
  { lineNumber: 3, productId: 'p', quantity: -1 },
])], [1, 2])
eq('en kredit er ikke dublet af varelinjen', duplicateProductLineNumbers([
  { lineNumber: 1, productId: 'p', quantity: 2 },
  { lineNumber: 2, productId: 'p', quantity: -2 },
]).size, 0)

const lines = purchasingLinesForReview([
  { lineNumber: 1, quantity: 2, productId: 'p', priceAtInvoice: 100, priceToday: 100 },
  { lineNumber: 2, quantity: 1, productId: 'p', priceAtInvoice: 100, priceToday: 100 },
  { lineNumber: 3, quantity: 1, productId: null, priceAtInvoice: null, priceToday: null },
])
eq('kun de to ens varer sendes videre', lines.map((l) => l.lineNumber), [1, 2])
eq('uden ordrelinje er forventet antal null', lines.every((l) => l.expectedQty === null), true)

const idle = casesWithoutNextAction(
  [{ id: 'a', caseNumber: '1', title: 'Tom' }, { id: 'b', caseNumber: '2', title: 'Optaget' }, { id: 'c', caseNumber: '3', title: 'Job' }],
  ['b'],
  ['c'],
)
eq('sag uden opgave og uden job', idle.map((c) => c.id), ['a'])

eq('forfaldne opgaver er et læsespørgsmål', interpretCrmQuestion('Forfaldne opgaver').kind, 'overdue_tasks')
eq('fakturaer til gennemgang er et læsespørgsmål', interpretCrmQuestion('Leverandørfakturaer til gennemgang').kind, 'supplier_invoices')
eq('sager uden næste handling er et læsespørgsmål', interpretCrmQuestion('Sager uden næste handling').kind, 'cases_without_action')
eq('jobs i dag er et læsespørgsmål', interpretCrmQuestion('Jobs i dag').kind, 'jobs_today')
eq('flyt uden sag er stadig afvist', interpretCrmQuestion('Flyt besigtigelse til fredag kl. 10').kind, 'write')

// --- Claude-review af batch 3: regressionstest for hvert fund ---

// Bevægelsesreglen ved grænsen: præcis 5 % OG præcis 0,50 kr tæller. Reglen er ikke ændret.
eq('præcis 5 % og 0,50 kr er en bevægelse', unitPriceMovement(10.5, 10).moved, true)
eq('præcis 5 % med øretal er en bevægelse', unitPriceMovement(13.23, 12.6).moved, true)
eq('præcis 5 % på 19,90 er en bevægelse', unitPriceMovement(20.895, 19.9).moved, true)
eq('0,49 kr er under grænsen', unitPriceMovement(10.49, 10).moved, false)
eq('0,495 kr rundes ikke op over grænsen', unitPriceMovement(10.495, 9.999999).moved, false)
eq('4,9 % er under grænsen', unitPriceMovement(104.9, 100).moved, false)
eq('et prisfald tæller også', unitPriceMovement(90, 100), { moved: true, diff: -10 })
eq('pris 0 i dag er ukendt, ikke et fald på 100 %', unitPriceMovement(0, 100), { moved: false, diff: null })

// Kendt vare uden pris i dag er ukendt og bliver ikke grøn
const unknownToday = purchasingLinesForReview([{ lineNumber: 7, quantity: 1, productId: 'p', priceAtInvoice: 100, priceToday: null }])
eq('kendt vare uden pris i dag sendes videre', unknownToday.map((l) => l.lineNumber), [7])
const unknownLight = invoiceTrafficLight({ ...base, purchasing: { lines: unknownToday } })
eq('ukendt pris i dag gør fakturaen gul', unknownLight.light, 'yellow')
eq('ukendt pris har intet beløb', unknownLight.findings.find((f) => f.code === 'missing_purchase_price')?.amount, null)
eq('umatchet linje uden pris sendes ikke som prisfund', purchasingLinesForReview([{ lineNumber: 8, quantity: 1, productId: null, priceAtInvoice: null, priceToday: null }]).length, 0)

// Forrang
const empty: InvoiceControl = { verdict: 'not_controllable', lines: [], controlledLines: 0, totalLines: 0, coveragePct: 0, overchargeAmount: 0 }
eq('faktura uden linjer er ikke grøn', invoiceTrafficLight({ control: empty, caseId: 's1', purchaseOrderId: 'po' }).light, 'unknown')
eq('læsefejl er ikke grøn', invoiceTrafficLight({ control: null, loadFailed: true, caseId: 's1', purchaseOrderId: 'po' }).light, 'unknown')
eq('indkøbstjek der fejler er ikke grønt', invoiceTrafficLight({ ...base, purchasing: { loadFailed: true } }).light, 'unknown')
eq('dublet er rød, selv om priserne stemmer', invoiceTrafficLight({ ...base, purchasing: { lines: [{ lineNumber: 1, invoicedQty: 1, expectedQty: null, catalogueUnitPrice: 10, previousUnitPrice: 10, duplicate: true }] } }).light, 'red')

// Dokumenttekst: kun rigtig dokumenttekst er "teksten"
const email = { bodyText: 'Hej, her er fakturaen', bodyPreview: 'Hej, her' }
eq('upload med tekst er dokumenttekst', invoiceTextOrigin({ source: 'upload', rawText: 'Faktura 1' }), 'extracted')
eq('tom tekst er ingen tekst', invoiceTextOrigin({ source: 'upload', rawText: '  ' }), 'none')
eq('mailens brødtekst er ikke dokumenttekst', invoiceTextOrigin({ source: 'email', rawText: ' Hej, her er fakturaen ', email }), 'not_document')
eq('mailens uddrag er ikke dokumenttekst', invoiceTextOrigin({ source: 'email', rawText: 'Hej, her', email }), 'not_document')
eq('læst vedhæftning er dokumenttekst', invoiceTextOrigin({ source: 'email', rawText: 'PDF-tekst', email }), 'extracted')
eq('mail der ikke kan læses er ukendt', invoiceTextOrigin({ source: 'email', rawText: 'PDF-tekst' }), 'unknown')
eq('API-data er ikke dokumenttekst', invoiceTextOrigin({ source: 'manual', rawText: '{"invoice":1}' }), 'not_document')
const noteFromMail = invoiceDocumentNote('Hej, her er fakturaen', 'not_document')
eq('mailtekst giver intet forslag', noteFromMail.includes('Foreslået'), false)
eq('ukendt oprindelse giver intet forslag', invoiceDocumentNote('x', 'unknown').includes('Foreslået'), false)
const noteFromPdf = invoiceDocumentNote('HEMMELIG-IBAN Faktura 123', 'extracted')
eq('forslag fra tekst viser ikke teksten', noteFromPdf.includes('HEMMELIG-IBAN'), false)
eq('forslag fra tekst siger faktura', noteFromPdf.startsWith('Teksten er brugt: indeholder faktura.'), true)
eq('forslag kalder ikke teksten et emne', noteFromPdf.includes('emne'), false)
eq('forslag godkender ikke', /Der godkendes og bogføres ikke/.test(noteFromPdf), true)

// Forfaldne opgaver: samme filtre og afgrænsning som opgavesiden
function fakeTaskQuery() {
  const calls: string[] = []
  const q: Record<string, (...a: unknown[]) => unknown> = {}
  for (const m of ['neq', 'not', 'lt', 'eq', 'or']) q[m] = (...a: unknown[]) => { calls.push(`${m}:${a.join(',')}`); return q }
  return { q, calls }
}
const NOW = new Date('2026-11-05T10:00:00.000Z')
const only = (...keys: string[]) => (p: never) => keys.includes(p as unknown as string)
const allScope = fakeTaskQuery()
overdueTaskFilter(allScope.q, { userId: 'u', hasPermission: only('customers.view.all', 'tasks.view') }, NOW)
eq('forfalden = ikke færdig, har dato og er passeret nu', allScope.calls, ['neq:status,done', 'not:due_date,is,', 'lt:due_date,2026-11-05T10:00:00.000Z'])
const ownScope = fakeTaskQuery()
overdueTaskFilter(ownScope.q, { userId: 'u', hasPermission: only('customers.view.all') }, NOW)
eq('salg og bogholderi tæller kun egne, som opgavesiden', ownScope.calls.at(-1), 'or:assigned_to.eq.u,created_by.eq.u')
const assignedScope = fakeTaskQuery()
overdueTaskFilter(assignedScope.q, { userId: 'u', hasPermission: only() }, NOW)
eq('montør tæller kun tildelte, som opgavesiden', assignedScope.calls.at(-1), 'eq:assigned_to,u')

// Sager uden næste handling: RLS må ikke få en travl sag til at se tom ud, og en fejl er ikke nul
function fakeDb(tables: Record<string, { rows?: Array<Record<string, unknown>>; error?: { message: string } }>) {
  const seen: Array<{ table: string; filters: string[] }> = []
  return {
    seen,
    client: {
      from(table: string) {
        const entry = { table, filters: [] as string[] }
        seen.push(entry)
        const t = tables[table] ?? {}
        const chain: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'neq', 'not', 'in', 'order']) chain[m] = (...a: unknown[]) => { entry.filters.push(`${m}:${JSON.stringify(a)}`); return chain }
        chain.range = async () => ({ data: t.rows ?? [], error: t.error ?? null })
        return chain
      },
    },
  }
}
const CASES = [{ id: 'a', case_number: '1', title: 'Tom' }, { id: 'b', case_number: '2', title: 'Skjult job' }, { id: 'c', case_number: '3', title: 'Skjult opgave' }]
async function idleTests() {
  const visible = fakeDb({ service_cases: { rows: CASES }, customer_tasks: { rows: [] }, work_orders: { rows: [] } })
  const internal = fakeDb({ customer_tasks: { rows: [{ id: 't', service_case_id: 'c' }] }, work_orders: { rows: [{ id: 'w', case_id: 'b' }] } })
  const found = await readCasesWithoutNextAction(visible.client, () => internal.client)
  eq('job og opgave skjult af RLS tæller stadig som næste handling', found.ok ? found.cases.map((c) => c.id) : found, ['a'])
  eq('sagerne læses kun med brugerens klient', visible.seen.map((s) => s.table), ['service_cases'])
  eq('den interne klient læser ingen sager', internal.seen.some((s) => s.table === 'service_cases'), false)
  eq('den interne klient læser kun brugerens sager', internal.seen.every((s) => s.filters.some((f) => f.includes('"a","b","c"'))), true)
  const tasksFail = await readCasesWithoutNextAction(fakeDb({ service_cases: { rows: CASES } }).client, () => fakeDb({ customer_tasks: { error: { message: 'x' } } }).client)
  eq('opgaver der ikke kan læses er ukendt, ikke nul', tasksFail.ok, false)
  const ordersFail = await readCasesWithoutNextAction(fakeDb({ service_cases: { rows: CASES } }).client, () => fakeDb({ work_orders: { error: { message: 'x' } } }).client)
  eq('ordrer der ikke kan læses er ukendt, ikke nul', ordersFail.ok, false)
  const casesFail = await readCasesWithoutNextAction(fakeDb({ service_cases: { error: { message: 'x' } } }).client, () => fakeDb({}).client)
  eq('sager der ikke kan læses er ukendt, ikke nul', casesFail.ok, false)
  const adminFail = await readCasesWithoutNextAction(fakeDb({ service_cases: { rows: CASES } }).client, () => { throw new Error('no admin') })
  eq('intern klient der fejler er ukendt, ikke nul', adminFail.ok, false)
}

// Katalogvare på sag
eq('åben sag kan modtage varen', caseAcceptsCatalogueMaterial({ status: 'in_progress', is_proposal: false }), null)
eq('sagsforslag afvises', caseAcceptsCatalogueMaterial({ status: 'new', is_proposal: true }) != null, true)
for (const status of ['closed', 'cancelled', 'converted']) eq(`${status} afvises`, caseAcceptsCatalogueMaterial({ status, is_proposal: false }) != null, true)

// Statiske værn: ingen genvej forbi gates eller til anden skrivning
const action = readFileSync('src/lib/actions/catalogue-case-material.ts', 'utf8')
eq('katalogvare kræver materials.add_to_case', action.includes("hasPermission('materials.add_to_case')"), true)
eq('katalogvare kræver kost-ret', action.includes('hasPermission(PRICE_PERMISSION)'), true)
eq('katalogvare tjekker sagens synlighed', action.includes('userCanViewCase(input.caseId, ctx)'), true)
eq('katalogvare går gennem createCaseMaterial', action.includes('createCaseMaterial({'), true)
eq('katalogvare skriver ikke selv i case_materials', action.includes(".from('case_materials')"), false)
eq('katalogvare gætter ingen arbejdsordre', action.includes('work_order_id: null') && !action.includes(".from('work_orders')"), true)
eq('katalogvare rører hverken KlarPris eller leverandørordre', /klarpris|purchase_order|supplier_order/i.test(action.split('*/')[1]), false)
const detailClient = readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
const panel = readFileSync('src/app/dashboard/incoming-invoices/[id]/invoice-control-panel.tsx', 'utf8')
eq('browseren får ikke fakturateksten', /raw_text|extractedText/.test(detailClient + panel), false)
const invoiceAction = readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')
eq('detaljesvaret fjerner raw_text', invoiceAction.includes('invoice.raw_text = null'), true)

idleTests().then(() => {
  if (bad) {
    console.error(`${bad} failed`)
    process.exit(1)
  }
  console.log('all passed')
})
