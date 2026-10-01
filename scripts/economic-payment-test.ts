/** Unit: e-conomic betalingspostering. Kør: npx tsx scripts/economic-payment-test.ts */
import { buildEconomicPaymentEntry } from '../src/lib/economic/payment-entry'
let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`) }
const cfg = { cashbookNumber: 1, bankContraAccountNumber: 5820 }
const ok = buildEconomicPaymentEntry({ invoice: { external_invoice_id: '1042', final_amount: 1250, amount_paid: 1250, paid_at: '2026-09-29T23:15:00Z' }, config: cfg, now: new Date('2026-10-03T10:00:00Z') })
eq('ren betaling kan bogføres', [ok.canPost, ok.issues], [true, []])
eq('dato = betalingsdag dansk (23:15Z = 30/9 dansk), ikke dags dato', ok.body.date, '2026-09-30')
eq('beløb negativt (indbetaling)', ok.body.amount, -1250)
eq('booket fakturanr.', ok.body.customerInvoice.bookedInvoiceNumber, 1042)
const draft = buildEconomicPaymentEntry({ invoice: { external_invoice_id: 'draft-77', final_amount: 1250, amount_paid: 1250, paid_at: '2026-09-29T10:00:00Z' }, config: cfg })
eq('kun kladde i e-conomic → afvist (før NaN)', [draft.canPost, draft.issues.map((i) => i.code), draft.body.customerInvoice.bookedInvoiceNumber], [false, ['draft_only'], null])
const credit = buildEconomicPaymentEntry({ invoice: { external_invoice_id: '1043', final_amount: -500, amount_paid: 0, paid_at: '2026-09-29T10:00:00Z' }, config: cfg })
eq('kreditnota → afvist (før bogført som indbetaling)', [credit.canPost, credit.issues.map((i) => i.code)], [false, ['credit_note']])
const noCfg = buildEconomicPaymentEntry({ invoice: { external_invoice_id: '1042', final_amount: 100, amount_paid: 100, paid_at: '2026-09-29T10:00:00Z' }, config: {} })
eq('manglende kassekladde/bank → afvist', noCfg.issues.map((i) => i.code), ['missing_config'])
const notExp = buildEconomicPaymentEntry({ invoice: { external_invoice_id: null, final_amount: 100, amount_paid: 100, paid_at: '2026-09-29T10:00:00Z' }, config: cfg })
eq('ikke eksporteret → afvist', notExp.issues.map((i) => i.code), ['not_exported'])
const noPaidAt = buildEconomicPaymentEntry({ invoice: { external_invoice_id: '9', final_amount: 100, amount_paid: 100, paid_at: null }, config: cfg, now: new Date('2026-10-03T22:30:00Z') })
eq('uden paid_at: dansk dags dato + info', [noPaidAt.canPost, noPaidAt.body.date, noPaidAt.issues.map((i) => i.code)], [true, '2026-10-04', ['paid_at_missing']])
const overpaid = buildEconomicPaymentEntry({ invoice: { external_invoice_id: '9', final_amount: 100, amount_paid: 120, paid_at: '2026-09-29T10:00:00Z' }, config: cfg })
eq('overbetaling: faktisk indbetalt beløb', overpaid.body.amount, -120)
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle betalings-tests PASS')
process.exitCode = fail ? 1 : 0
