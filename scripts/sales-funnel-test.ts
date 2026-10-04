/**
 * Unit-tests for N53 salgstragt (src/lib/reports/sales-funnel.ts). Ingen DB.
 *   npx tsx scripts/sales-funnel-test.ts
 */
import { computeSalesFunnel, lastMonths } from '../src/lib/reports/sales-funnel'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

ok(JSON.stringify(lastMonths(new Date('2026-02-15T12:00:00Z'), 3)) === JSON.stringify(['2025-12', '2026-01', '2026-02']), 'lastMonths krydser årsskifte', JSON.stringify(lastMonths(new Date('2026-02-15T12:00:00Z'), 3)))
// 31. januar 23:30 dansk tid = 22:30 UTC → januar; 1. februar 00:30 dansk = 31. jan 23:30 UTC → februar
ok(JSON.stringify(lastMonths(new Date('2026-01-31T23:30:00Z'), 1)) === '["2026-02"]', 'dansk tid ved månedsskifte')

const f = computeSalesFunnel({
  months: ['2026-09', '2026-10'],
  customers: [{ created_at: '2026-09-03T10:00:00Z' }, { created_at: '2026-10-01T10:00:00Z' }, { created_at: '2026-08-31T10:00:00Z' }],
  offers: [
    { created_at: '2026-09-04T10:00:00Z', sent_at: '2026-09-05T10:00:00Z', accepted_at: '2026-10-02T10:00:00Z', final_amount: 10000 },
    { created_at: '2026-09-10T10:00:00Z', sent_at: '2026-09-11T10:00:00Z', accepted_at: null, final_amount: 5000 },
    { created_at: '2026-10-03T10:00:00Z', sent_at: null, accepted_at: null, final_amount: 999 },
    { created_at: '2026-10-03T10:00:00Z', sent_at: '2026-10-03T11:00:00Z', accepted_at: null, final_amount: 1, is_proposal: true },
  ],
  invoices: [
    { created_at: '2026-10-05T10:00:00Z', status: 'sent', invoice_type: 'standard', voided_at: null, total_amount: 8000 },
    { created_at: '2026-10-06T10:00:00Z', status: 'sent', invoice_type: 'credit', voided_at: null, total_amount: 1000 },
    { created_at: '2026-10-06T10:00:00Z', status: 'draft', invoice_type: 'standard', voided_at: null, total_amount: 5000 },
    { created_at: '2026-10-06T10:00:00Z', status: 'sent', invoice_type: 'standard', voided_at: '2026-10-07T10:00:00Z', total_amount: 7000 },
  ],
})
const [sep, oct] = f.months
ok(sep.new_customers === 1 && oct.new_customers === 1, 'nye kunder pr. måned (august udenfor)')
ok(sep.offers_created === 2 && sep.offers_sent === 2 && oct.offers_created === 1 && oct.offers_sent === 0, 'oprettet/sendt (forslag udelukket)', JSON.stringify(f.months))
ok(oct.offers_accepted === 1 && oct.accepted_value === 10000, 'accepteret i acceptmåneden med værdi')
ok(oct.invoiced_ex_vat === 7000, 'faktureret = udstedt − kredit (kladde/annulleret udelukket)', String(oct.invoiced_ex_vat))
ok(f.totals.sent_rate === 66.67 && f.totals.win_rate === 50, 'konverteringsrater', JSON.stringify(f.totals))
const empty = computeSalesFunnel({ months: ['2026-10'], customers: [], offers: [], invoices: [] })
ok(empty.totals.sent_rate === null && empty.totals.win_rate === null, 'ingen data → ingen rater')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle salgstragt-tests bestået')
process.exitCode = bad ? 1 : 0
