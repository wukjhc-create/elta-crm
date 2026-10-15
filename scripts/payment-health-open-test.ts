/**
 * Unit-tests: betalingsstatus bruger åbent beløb (B-3) — src/lib/invoices/payment-health.ts. Ingen DB.
 *   npx tsx scripts/payment-health-open-test.ts
 */
import { computePaymentHealth, type HealthInvoice } from '../src/lib/invoices/payment-health'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

const now = new Date('2026-10-16T10:00:00Z').getTime()
const base = { invoice_type: 'standard', voided_at: null, paid_at: null, sent_at: '2026-09-01T10:00:00Z' }
const rows: HealthInvoice[] = [
  { ...base, status: 'sent', final_amount: 1000, due_date: '2026-10-01', open_amount: 400 },
  { ...base, status: 'sent', final_amount: 500, due_date: '2026-10-01', open_amount: 0 },
  { ...base, status: 'sent', final_amount: 300, due_date: '2026-11-01' },
]
const h = computePaymentHealth(rows, now)
const m = h
ok(m.outstanding_total === 700, 'udestående = åbent beløb (400 + 0 + 300 uden open_amount)', String(m.outstanding_total))
ok(m.overdue_count === 1 && m.overdue_total === 400, 'fuldt betalt/krediteret forfalden tælles ikke', `${m.overdue_count}/${m.overdue_total}`)

console.log(bad ? `\n${bad} FAIL` : '\nALL PASS')
process.exit(bad ? 1 : 0)
