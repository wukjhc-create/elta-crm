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

if (bad) {
  console.error(`${bad} failed`)
  process.exit(1)
}
console.log('all passed')
