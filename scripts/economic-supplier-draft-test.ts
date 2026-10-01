/** Unit: e-conomic leverandørfakturakladde. Kør: npx tsx scripts/economic-supplier-draft-test.ts */
import { buildEconomicSupplierInvoiceDraft, type SupplierDraftInput } from '../src/lib/economic/supplier-invoice-draft'
let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`) }
const base: SupplierDraftInput = {
  invoice: { invoice_number: 'AO-77', invoice_date: '2026-09-30', due_date: '2026-10-30', amount_excl_vat: 1000, vat_amount: 250, amount_incl_vat: 1250 },
  supplierNumber: 12,
  lines: [
    { line_number: 1, description: 'Kabel', quantity: 10, unit_price: 50, total_price: 500 },
    { line_number: 2, description: 'Dåser', quantity: 5, unit_price: 100, total_price: 500 },
  ],
  config: { costAccountNumber: 4000 },
}
const ok = buildEconomicSupplierInvoiceDraft(base)
eq('linjer = faktura → kan bogføres uden bemærkninger', [ok.canPost, ok.issues, ok.economicNet], [true, [], 1000])
eq('omkostningskonto på linjer', ok.body.lines.map((l) => l.costAccount.accountNumber), [4000, 4000])

const partial = buildEconomicSupplierInvoiceDraft({ ...base, lines: [base.lines[0]] })
eq('delvist udlæst → differencelinje så bogført = faktura (før: kun 500)', [partial.economicNet, partial.body.lines.length, partial.body.lines[1].amount], [1000, 2, 500])
eq('differencelinje er info, ikke fejl', [partial.canPost, partial.issues.map((i) => i.code)], [true, ['adjustment_line']])

const noLinesNoNet = buildEconomicSupplierInvoiceDraft({ ...base, lines: [], invoice: { ...base.invoice, amount_excl_vat: null, vat_amount: null } })
eq('ingen linjer + kun inkl. moms → afvises (før: 1250 bogført som omkostning)', [noLinesNoNet.canPost, noLinesNoNet.issues.map((i) => i.code)], [false, ['missing_net_amount']])

const derived = buildEconomicSupplierInvoiceDraft({ ...base, lines: [], invoice: { ...base.invoice, amount_excl_vat: null } })
eq('netto udledt af inkl. − moms', [derived.canPost, derived.economicNet, derived.issues.map((i) => i.code)], [true, 1000, ['net_derived', 'single_line']])

const noDate = buildEconomicSupplierInvoiceDraft({ ...base, invoice: { ...base.invoice, invoice_date: null } })
eq('manglende fakturadato → afvises', [noDate.canPost, noDate.issues.map((i) => i.code)], [false, ['missing_invoice_date']])

const unlinked = buildEconomicSupplierInvoiceDraft({ ...base, supplierNumber: null, config: {} })
eq('ukoblet leverandør + ingen konto → fejl', unlinked.issues.map((i) => i.code), ['supplier_not_linked', 'missing_config'])

const credit = buildEconomicSupplierInvoiceDraft({ ...base, invoice: { ...base.invoice, amount_excl_vat: -200 }, lines: [{ description: 'Retur', quantity: 1, total_price: -200 }] })
eq('kreditnota fra leverandør', [credit.canPost, credit.economicNet], [true, -200])

const unitOnly = buildEconomicSupplierInvoiceDraft({ ...base, lines: [{ description: 'X', quantity: 4, unit_price: 250, total_price: null }] })
eq('linje uden total → antal × stk-pris (før: kun stk-pris)', [unitOnly.economicNet, unitOnly.issues], [1000, []])
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle leverandør-kladde-tests PASS')
process.exitCode = fail ? 1 : 0
