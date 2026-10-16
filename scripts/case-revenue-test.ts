/**
 * Unit-test (ingen DB) for PE-6 omsætningsgrundlag på sagens foreløbige DB (lib/cases/expected-revenue.ts).
 *   npx tsx scripts/case-revenue-test.ts
 */
import { expectedCaseRevenue } from '../src/lib/cases/expected-revenue'

let bad = 0
const ok = (c: boolean, label: string, note = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
const e = expectedCaseRevenue

{
  const r = e({ contractSum: 100000, revisedSum: null, registeredSale: 160000, netInvoicedExVat: 0 })
  ok(r.basis === 'contract' && r.revenue === 100000, 'kontraktsag: kontraktsum, ikke registrerede listepriser', JSON.stringify(r))
}
{
  const r = e({ contractSum: '100000.00', revisedSum: '120000.00', registeredSale: 50000, netInvoicedExVat: 0 })
  ok(r.basis === 'contract' && r.revenue === 120000, 'revideret sum vinder over oprindelig (DB-strenge)', JSON.stringify(r))
}
{
  const r = e({ contractSum: 100000, revisedSum: null, registeredSale: 0, netInvoicedExVat: 112500.5 })
  ok(r.basis === 'invoiced' && r.revenue === 112500.5, 'faktureret mere end kontrakt (ekstraarbejde): netto faktureret', JSON.stringify(r))
}
{
  const r = e({ contractSum: 100000, revisedSum: null, registeredSale: 0, netInvoicedExVat: 40000 })
  ok(r.basis === 'contract' && r.revenue === 100000, 'delvist faktureret kontraktsag: stadig kontraktsum')
}
{
  const r = e({ contractSum: null, revisedSum: null, registeredSale: 8765.432, netInvoicedExVat: 9000 })
  ok(r.basis === 'registered' && r.revenue === 8765.43, 'regningsarbejde: registreret salg (uændret adfærd)', JSON.stringify(r))
}
{
  const r = e({ contractSum: 0, revisedSum: null, registeredSale: 5000, netInvoicedExVat: 0 })
  ok(r.basis === 'contract' && r.revenue === 0, 'kontraktsum 0 er en kontrakt (fx garantisag) — ikke regningsarbejde')
}
ok(e({ contractSum: '', revisedSum: undefined, registeredSale: 10, netInvoicedExVat: 0 }).basis === 'registered', 'tom streng = ingen kontraktsum')
// F-4 (00232): regningsarbejde regnes mod registreret salg selv med kontraktsum; revideret 0 overtrumfer ikke kontraktsum
ok(e({ contractSum: 80000, revisedSum: null, registeredSale: 120000, netInvoicedExVat: 0, billingModel: 'time_and_materials' }).revenue === 120000, 'regning med kontraktsum → registreret salg')
ok(e({ contractSum: 80000, revisedSum: 0, registeredSale: 1, netInvoicedExVat: 0 }).revenue === 80000, 'revideret 0 → kontraktsum')
ok(e({ contractSum: 80000, revisedSum: 90000, registeredSale: 1, netInvoicedExVat: 0, billingModel: 'fixed_price' }).revenue === 90000, 'fast pris: revideret beløb')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ omsætningsgrundlag ok')
process.exitCode = bad ? 1 : 0
