/**
 * Unit-test (ingen DB) for L-7 rettelse af leverandørfakturahoved (lib/invoices/incoming-header-edit.ts).
 *   npx tsx scripts/invoice-header-edit-test.ts
 */
import { validateInvoiceHeaderEdit, type InvoiceHeaderValues } from '../src/lib/invoices/incoming-header-edit'

let bad = 0
const ok = (c: boolean, label: string, note = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
const cur: InvoiceHeaderValues = {
  invoice_number: '1001', invoice_date: '2026-10-01', due_date: '2026-10-31', currency: 'DKK',
  amount_excl_vat: 1000, vat_amount: 250, amount_incl_vat: 1250,
}
const v = (input: Parameters<typeof validateInvoiceHeaderEdit>[1], c = cur) => validateInvoiceHeaderEdit(c, input)

{
  const r = v({ amount_excl_vat: 800, vat_amount: 200, amount_incl_vat: 1000 })
  ok(r.ok && r.changed.length === 3 && r.patch.amount_incl_vat === 1000, 'konsistente beløb gemmes')
}
ok(!v({ vat_amount: 300 }).ok, 'moms der ikke passer med ekskl./inkl. afvises')
ok(!v({ amount_excl_vat: 250, vat_amount: 1000, amount_incl_vat: 1250 }).ok, 'moms over 25 % (Momsgrundlag-fejlen) afvises')
{
  const r = v({ amount_excl_vat: -800, vat_amount: -200, amount_incl_vat: -1000 })
  ok(r.ok, 'kreditnota med negative beløb er gyldig')
}
{
  const r = v({ amount_incl_vat: null }, { ...cur, amount_incl_vat: null })
  ok(r.ok && r.next.amount_incl_vat === 1250, 'manglende inkl. beregnes fra ekskl. + moms')
}
ok(!v({ invoice_number: '   ' }).ok, 'tomt fakturanummer afvises')
{
  const r = v({ invoice_number: '  1002 ' })
  ok(r.ok && r.patch.invoice_number === '1002', 'fakturanummer trimmes')
}
ok(!v({ invoice_date: '2026-02-30' }).ok, 'ugyldig kalenderdato afvises')
ok(!v({ due_date: '2026-09-01' }).ok, 'forfald før fakturadato afvises')
{
  const r = v({ due_date: null })
  ok(r.ok && r.patch.due_date === null, 'forfaldsdato kan ryddes')
}
{
  const r = v({ currency: 'eur' })
  ok(r.ok && r.patch.currency === 'EUR', 'valuta normaliseres til store bogstaver')
}
ok(!v({ currency: 'KRONER' }).ok, 'ugyldig valutakode afvises')
ok(!v({ amount_excl_vat: NaN }).ok, 'ugyldigt beløb (NaN) afvises')
{
  const r = v({ amount_excl_vat: 1000.004 })
  ok(r.ok && r.changed.length === 0, 'afrunding til øre: ingen reel ændring → intet patch')
}
{
  const r = v({ invoice_number: '1001', currency: 'DKK' })
  ok(r.ok && Object.keys(r.patch).length === 0, 'uændrede værdier giver tomt patch')
}

// IV-15: blandede fortegn afvises; en hel kreditnota (alle negative) er ok
ok(!v({ amount_excl_vat: -1000, vat_amount: 250, amount_incl_vat: -750 }).ok, 'blandede fortegn afvises')
ok(v({ amount_excl_vat: -1000, vat_amount: -250, amount_incl_vat: -1250 }).ok, 'kreditnota med negative beløb accepteres')
ok(v({ amount_excl_vat: 1000, vat_amount: 0, amount_incl_vat: 1000 }).ok, 'momsfri faktura (moms 0) accepteres')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ fakturahoved-rettelse ok')
process.exitCode = bad ? 1 : 0
