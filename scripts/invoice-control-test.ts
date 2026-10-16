/**
 * Unit-test af fakturakontrol-motoren (P3 #19). Ingen DB.
 *   npx tsx scripts/invoice-control-test.ts
 */
import { controlInvoice, controlLine, type InvoiceLineInput } from '../src/lib/invoice-control/engine'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }
const L = (n: number, unit: number | null, expected: number | null, qty: number | null = 10, reason?: string): InvoiceLineInput =>
  ({ lineNumber: n, description: `linje ${n}`, quantity: qty, unitPrice: unit, expectedUnitPrice: expected, expectedMissingReason: reason })

assert(controlLine(L(1, 100, 100)).verdict === 'ok', 'præcis aftalt pris: ok')
assert(controlLine(L(1, 101.5, 100)).verdict === 'ok', '1,5 % over: inden for 2 %-tolerance')
assert(controlLine(L(1, 1.2, 1.0)).verdict === 'ok', '20 % over men kun 0,20 kr/stk: under kr-tolerance (afrunding) -> ok')
{
  const c = controlLine(L(1, 110, 100, 10))
  assert(c.verdict === 'overcharge' && c.varianceAmount === 100 && c.variancePct === 10, '10 % over på 10 stk: merbetaling 100 kr', JSON.stringify(c))
}
assert(controlLine(L(1, 90, 100)).verdict === 'undercharge', '10 % under: markeres også (kan være forkert vare/mængde)')
assert(controlLine(L(1, 100, null, 10, 'intet produktmatch')).reason === 'intet produktmatch', 'uden forventet pris: ikke kontrolleret med årsag')
assert(controlLine(L(1, null, 100)).verdict === 'not_controllable', 'uden enhedspris: ikke kontrolleret')

{
  const r = controlInvoice([L(2, 110, 100), L(1, 100, 100), L(3, 50, null)])
  assert(r.verdict === 'deviation' && r.controlledLines === 2 && r.totalLines === 3 && r.coveragePct === 66.67 && r.overchargeAmount === 100, 'blandet faktura: afvigelse, dækning 66,67 %, merbetaling 100 kr', JSON.stringify({ v: r.verdict, c: r.coveragePct, o: r.overchargeAmount }))
  assert(r.lines.map((l) => l.lineNumber).join() === '1,2,3', 'linjer sorteres deterministisk')
}
assert(controlInvoice([L(1, 100, 100), L(2, 5, null)]).verdict === 'partially_controlled', 'ingen afvigelse men ikke alle kontrolleret: delvist')
assert(controlInvoice([L(1, 100, null), L(2, 5, null)]).verdict === 'not_controllable', 'ingen kontrollerbare linjer: aldrig "ok"')
assert(controlInvoice([]).verdict === 'not_controllable' && controlInvoice([]).coveragePct === 0, 'faktura uden linjer: ikke kontrollerbar, dækning 0 %')

// Leverandørfaktura-review 2026-10-14 (#8): lav enhedspris, stor mængde → linje-tolerancen fanger merbetalingen
{
  const c = controlLine(L(1, 4.45, 4.0, 500))
  assert(c.verdict === 'overcharge' && c.varianceAmount === 225, 'kabel 4,00 → 4,45 kr/m × 500 m (+11 %, 225 kr): markeres', `${c.verdict} ${c.varianceAmount}`)
}
assert(controlLine(L(1, 1.2, 1.0, 10)).verdict === 'ok', '20 % over men kun 2 kr på linjen: stadig ok (afrunding)')
assert(controlLine(L(1, 4.05, 4.0, 500)).verdict === 'ok', '1,25 % over på 500 m (25 kr): inden for procent-tolerancen')

// F-9 (review 2026-10-16): enhed afviger (ring vs. meter) → ikke kontrollerbar (før −99 % "underpris")
{
  const c = controlLine({ ...L(1, 4.5, 450, 100), unit: 'M', expectedUnit: 'rl' })
  assert(c.verdict === 'not_controllable' && /enhed afviger/.test(c.reason), 'faktura pr. meter mod katalog pr. ring: ikke kontrollerbar', `${c.verdict} ${c.reason}`)
}
assert(controlLine({ ...L(1, 100, 100, 1), unit: 'stk.', expectedUnit: 'ST' }).verdict === 'ok', 'stk./ST regnes som samme enhed')
// F-10: kreditlinje — lavere kreditpris end aftalt er et tab (merbetaling), beløb på |antal|
{
  const c = controlLine(L(1, 90, 100, -2))
  assert(c.verdict === 'overcharge' && c.varianceAmount === 20, 'kredit 2 stk à 90 mod 100: vi mister 20 kr', `${c.verdict} ${c.varianceAmount}`)
}
{
  const c = controlLine(L(1, 110, 100, -2))
  assert(c.verdict === 'undercharge' && c.varianceAmount === -20, 'kredit à 110 mod 100: til vores fordel', `${c.verdict} ${c.varianceAmount}`)
}

console.log(`\n${fails === 0 ? '✅ ALLE FAKTURAKONTROL-TESTS PASS' : `❌ ${fails} FEJL`}`)
process.exit(fails === 0 ? 0 : 1)
