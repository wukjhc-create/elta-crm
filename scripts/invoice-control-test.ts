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

console.log(`\n${fails === 0 ? '✅ ALLE FAKTURAKONTROL-TESTS PASS' : `❌ ${fails} FEJL`}`)
process.exit(fails === 0 ? 0 : 1)
