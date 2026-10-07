/** Unit: ufakturerede poster + lukke-besked. Kør: npx tsx scripts/unbilled-test.ts */
import { summarizeUnbilled, unbilledCloseMessage } from '../src/lib/invoices/unbilled'
let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`) }
const done = { end_time: '2026-10-01T10:00:00Z' }
const s = summarizeUnbilled({
  timeLogs: [
    { ...done, sale_amount: 1000, billable: true, invoice_line_id: null },
    { ...done, sale_amount: 500, billable: true, invoice_line_id: 'x' },
    { ...done, sale_amount: 300, billable: false, invoice_line_id: null },
    { end_time: null, sale_amount: null, billable: true, invoice_line_id: null },
  ],
  materials: [{ total_sales_price: '1250.50', billable: true, invoice_line_id: null }, { total_sales_price: 99, billable: null, invoice_line_id: null }],
  otherCosts: [{ total_sales_price: 200, billable: true, invoice_line_id: 'y' }],
})
eq('optælling', [s.timeLogs, s.materials, s.otherCosts, s.count, s.billedLines, s.openTimer], [1, 2, 0, 3, 2, true])
eq('salgssum (ikke-fakturerbar + låste udeladt)', s.saleTotal, 2349.5)
eq('besked', unbilledCloseMessage(s), '1 timerække og 2 materialer for i alt 2.349,50 kr ekskl. moms er ikke faktureret på sagen. Der kører en timer på sagen.')
const clean = summarizeUnbilled({ timeLogs: [{ ...done, sale_amount: 1, billable: true, invoice_line_id: 'z' }], materials: [], otherCosts: [] })
eq('alt faktureret → ingen besked', unbilledCloseMessage(clean), null)
const onlyTimer = summarizeUnbilled({ timeLogs: [{ end_time: null, sale_amount: null, billable: true, invoice_line_id: null }], materials: [], otherCosts: [] })
eq('kun kørende timer', unbilledCloseMessage(onlyTimer), 'Der kører en timer på sagen.')
const three = summarizeUnbilled({ timeLogs: [{ ...done, sale_amount: 10, billable: true, invoice_line_id: null }, { ...done, sale_amount: 10, billable: true, invoice_line_id: null }],
  materials: [{ total_sales_price: 5, billable: true, invoice_line_id: null }], otherCosts: [{ total_sales_price: 5, billable: true, invoice_line_id: null }] })
eq('tre slags', unbilledCloseMessage(three), '2 timerækker, 1 materiale og 1 øvrig omkostning for i alt 30,00 kr ekskl. moms er ikke faktureret på sagen.')
// X1: timer uden salgssnapshot prissættes som på fakturaen (live sats → fallback 650), ikke 0 kr
const live = summarizeUnbilled({ timeLogs: [{ ...done, hours: 2, sale_amount: null, billable: true, invoice_line_id: null, employee: { hourly_rate: 500 } }], materials: [], otherCosts: [] })
eq('time uden snapshot → live sats (2 t × 500)', live.saleTotal, 1000)
const fb = summarizeUnbilled({ timeLogs: [{ ...done, hours: 3, sale_amount: null, billable: true, invoice_line_id: null, employee: [{ hourly_rate: null }] }], materials: [], otherCosts: [] })
eq('time uden snapshot og sats → fallback (3 t × 650)', fb.saleTotal, 1950)
const snap = summarizeUnbilled({ timeLogs: [{ ...done, hours: 2, sale_amount: 1234, billable: true, invoice_line_id: null, employee: { hourly_rate: 500 } }], materials: [], otherCosts: [] })
eq('snapshot vinder over live sats', snap.saleTotal, 1234)
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle ufakturerede-tests PASS')
process.exitCode = fail ? 1 : 0
