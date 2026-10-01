/** Unit: e-conomic fakturakladde-mapping + kontrol. Kør: npx tsx scripts/economic-draft-test.ts */
import { buildEconomicInvoiceDraft, type EconomicDraftInput } from '../src/lib/economic/invoice-draft'
let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`) }
const cfg = { layoutNumber: 19, paymentTermsNumber: 1, vatZoneNumber: 1, defaultProductNumber: '100' }
const base: EconomicDraftInput = {
  invoice: { invoice_number: 'F-1001', created_at: '2026-10-14T22:30:00Z', total_amount: 1120 },
  customer: { company_name: 'Hansen ApS', billing_address: 'Vej 1', billing_postal_code: '8000', billing_city: 'Aarhus' },
  customerNumber: 42,
  lines: [
    { position: 1, description: 'Timer (2,00 t)', quantity: 2, unit_price: 500, total_price: 1000 },
    { position: 2, description: 'Kabel', quantity: 10, unit_price: 12, total_price: 120 },
  ],
  config: cfg,
}
const ok = buildEconomicInvoiceDraft(base)
eq('ren faktura kan bogføres', ok.canPost, true)
eq('ingen fejl', ok.issues, [])
eq('e-conomic netto = CRM netto', [ok.economicNet, ok.crmNet], [1120, 1120])
eq('dato = dansk kalenderdag (22:30Z = 00:30 dansk dagen efter)', ok.body.date, '2026-10-15')
eq('varenr. fra opsætning', ok.body.lines[0].product.productNumber, '100')
eq('reference = fakturanr.', ok.body.references.other, 'F-1001')

const odd = buildEconomicInvoiceDraft({ ...base, invoice: { ...base.invoice, total_amount: 173.25 + 120 },
  lines: [{ position: 1, description: 'Timer', quantity: 0.33, unit_price: 525.1, total_price: 173.25 }, base.lines[1]] })
eq('linje hvor antal×pris ≠ total → blokerende', odd.issues.map((i) => i.code), ['line_total_mismatch', 'sum_mismatch'])
eq('kan ikke bogføres', odd.canPost, false)

const noCfg = buildEconomicInvoiceDraft({ ...base, config: { defaultProductNumber: null } })
eq('manglende opsætning → fejl', noCfg.issues[0].code, 'missing_config')
eq('standard-varenr. 1', noCfg.body.lines[0].product.productNumber, '1')

const newCust = buildEconomicInvoiceDraft({ ...base, customerNumber: null })
eq('ukoblet kunde = kun info', [newCust.canPost, newCust.issues.map((i) => i.severity)], [true, ['info']])

const credit = buildEconomicInvoiceDraft({ ...base, invoice: { ...base.invoice, total_amount: -300 },
  lines: [{ position: 1, description: 'Kredit', quantity: 1, unit_price: -300, total_price: -300 }] })
eq('kreditnota = info, kan bogføres', [credit.canPost, credit.issues.map((i) => i.code)], [true, ['credit_note']])

const empty = buildEconomicInvoiceDraft({ ...base, lines: [] })
eq('ingen linjer → fejl', [empty.canPost, empty.issues.map((i) => i.code)], [false, ['no_lines']])
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle e-conomic-kladde-tests PASS')
process.exitCode = fail ? 1 : 0
