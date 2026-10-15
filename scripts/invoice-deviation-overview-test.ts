/**
 * Unit-tests for prisafvigelser på tværs af leverandørfakturaer (src/lib/invoice-control/deviation-overview.ts). Ingen DB.
 *   npx tsx scripts/invoice-deviation-overview-test.ts
 */
import { controlInvoice } from '../src/lib/invoice-control/engine'
import { summarizeDeviations } from '../src/lib/invoice-control/deviation-overview'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

// Faktura A (AO): kabel 500 m til 4,45 mod aftalt 4,00 (+225 kr), tavle ok, én linje uden match
const a = controlInvoice([
  { lineNumber: 1, description: 'Kabel', quantity: 500, unitPrice: 4.45, expectedUnitPrice: 4 },
  { lineNumber: 2, description: 'Tavle', quantity: 1, unitPrice: 1000, expectedUnitPrice: 1000 },
  { lineNumber: 3, description: 'Fragt', quantity: 1, unitPrice: 95, expectedUnitPrice: null, expectedMissingReason: 'intet produktmatch' },
])
// Faktura B (LM): for billigt (undercharge) — afvigelse men ingen merbetaling
const b = controlInvoice([{ lineNumber: 1, description: 'Stikkontakt', quantity: 100, unitPrice: 20, expectedUnitPrice: 25 }])
// Faktura C (AO): alt ok
const c = controlInvoice([{ lineNumber: 1, description: 'Rør', quantity: 10, unitPrice: 12, expectedUnitPrice: 12 }])
// Faktura D (AO): +50 kr
const d = controlInvoice([{ lineNumber: 1, description: 'Dåse', quantity: 100, unitPrice: 3.5, expectedUnitPrice: 3 }])

const o = summarizeDeviations([
  { id: 'a', invoice_number: '1', invoice_date: '2026-10-01', supplier_name: 'AO', status: 'approved', control: a },
  { id: 'b', invoice_number: '2', invoice_date: '2026-10-02', supplier_name: 'LM', status: 'awaiting_approval', control: b },
  { id: 'c', invoice_number: '3', invoice_date: '2026-10-03', supplier_name: 'AO', status: 'approved', control: c },
  { id: 'd', invoice_number: '4', invoice_date: '2026-10-04', supplier_name: 'AO', status: 'posted', control: d },
])
ok(o.invoices === 4 && o.with_deviation === 3, 'antal fakturaer / med afvigelse', JSON.stringify({ i: o.invoices, w: o.with_deviation }))
ok(o.overcharge_total === 275, 'samlet merbetaling = kun positive afvigelser (225 + 50)', String(o.overcharge_total))
ok(o.total_lines === 6 && o.controlled_lines === 5 && o.coverage_pct === 83, 'dækning (5 af 6 linjer kontrolleret)', `${o.controlled_lines}/${o.total_lines} ${o.coverage_pct}`)
ok(o.rows.length === 3 && o.rows[0].id === 'a' && o.rows[1].id === 'd' && !o.rows.some((r) => r.id === 'c'), 'kun fakturaer med afvigelse, største merbetaling først', o.rows.map((r) => r.id).join(','))
const ao = o.by_supplier.find((s) => s.supplier_name === 'AO')
ok(!!ao && ao.invoices === 2 && ao.overcharge_amount === 275 && o.by_supplier[0].supplier_name === 'AO', 'pr. leverandør (AO: 2 fakturaer, 275 kr)', JSON.stringify(o.by_supplier))
ok(o.by_supplier.find((s) => s.supplier_name === 'LM')?.overcharge_amount === 0, 'for billigt = afvigelse uden merbetaling')
const e = summarizeDeviations([])
ok(e.invoices === 0 && e.coverage_pct === 0 && e.rows.length === 0, 'tom liste')

console.log(bad ? `\n${bad} FEJL` : '\nalle bestået')
process.exitCode = bad ? 1 : 0
