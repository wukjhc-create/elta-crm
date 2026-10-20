/**
 * Unit-tests: fakturanøgletal over hele datasættet (B-2) — src/lib/invoices/invoice-totals.ts. Ingen DB.
 *   npx tsx scripts/invoice-totals-test.ts
 */
import { computeInvoiceTotals, type InvoiceTotalsRow } from '../src/lib/invoices/invoice-totals'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

const now = new Date('2026-10-16T10:00:00Z').getTime()
const rows: InvoiceTotalsRow[] = []
// 600 sendte, forfaldne DKK-fakturaer à 100 (flere end listens loft på 500)
for (let i = 0; i < 600; i++) rows.push({ id: `s${i}`, invoice_type: 'standard', status: 'sent', final_amount: 100, currency: 'DKK', due_date: '2026-10-01' })
// delbetalt 1.000 − 600 = 400, ikke forfalden
rows.push({ id: 'p1', invoice_type: 'standard', status: 'sent', final_amount: 1000, amount_paid: 600, currency: 'DKK', due_date: '2026-11-01' })
// krediteret fuldt (sendt kreditnota) → 0 åbent, ikke forfalden
rows.push({ id: 'c1', invoice_type: 'standard', status: 'sent', final_amount: 500, currency: 'DKK', due_date: '2026-10-01' })
rows.push({ id: 'cn1', invoice_type: 'credit', status: 'sent', final_amount: -500, credit_of_invoice_id: 'c1', currency: 'DKK' })
// annulleret kreditnota trækkes IKKE fra
rows.push({ id: 'c2', invoice_type: 'standard', status: 'sent', final_amount: 300, currency: 'DKK', due_date: '2026-11-01' })
rows.push({ id: 'cn2', invoice_type: 'credit', status: 'sent', final_amount: -300, credit_of_invoice_id: 'c2', currency: 'DKK', voided_at: '2026-10-10T00:00:00Z' })
// EUR: tælles separat, ikke i beløbene
rows.push({ id: 'e1', invoice_type: 'standard', status: 'sent', final_amount: 999, currency: 'EUR', due_date: '2026-10-01' })
// kladder (én annulleret)
rows.push({ id: 'd1', invoice_type: 'standard', status: 'draft', final_amount: 50 })
rows.push({ id: 'd2', invoice_type: 'standard', status: 'draft', final_amount: 50, voided_at: '2026-10-02T00:00:00Z' })
// betalt i oktober (dansk tid: 1. okt 00:30 = 30. sep 22:30 UTC) og i september
rows.push({ id: 'b1', invoice_type: 'standard', status: 'paid', final_amount: 250, currency: 'DKK', paid_at: '2026-09-30T22:30:00Z' })
rows.push({ id: 'b2', invoice_type: 'standard', status: 'paid', final_amount: 999, currency: 'DKK', paid_at: '2026-09-15T10:00:00Z' })
// annulleret sendt faktura tæller ikke
rows.push({ id: 'v1', invoice_type: 'standard', status: 'sent', final_amount: 777, currency: 'DKK', due_date: '2026-10-01', voided_at: '2026-10-05T00:00:00Z' })

const t = computeInvoiceTotals(rows, now)
ok(t.outstanding === 60000 + 400 + 0 + 300, 'udestående over alle (600×100 + 400 + 0 + 300)', String(t.outstanding))
ok(t.overdueCount === 600 && t.overdueSum === 60000, 'forfaldne: 600 — fuldt krediteret og EUR tæller ikke', `${t.overdueCount}/${t.overdueSum}`)
ok(t.draftCount === 1, 'kladder uden annullerede', String(t.draftCount))
ok(t.paidThisMonth === 250, 'betalt denne måned i dansk tid', String(t.paidThisMonth))
ok(t.otherCurrencyCount === 1, 'EUR tælles separat', String(t.otherCurrencyCount))

// Totalerne afhænger ikke af listens loft: beregnet på alle rækker ≠ beregnet på de 500 første
const capped = computeInvoiceTotals(rows.slice(0, 500), now)
ok(capped.overdueCount === 500 && t.overdueCount === 600, 'afkortet liste ville give forkert tal (500) — fuldt datasæt giver 600')
ok(t.overdue.length === 600 && t.overdue[0].days >= t.overdue[t.overdue.length - 1].days, 'forfaldsliste sorteret efter dage')

// FIN-6 (2026-10-17): betalt denne måned = faktisk indbetalt (12.500 − kredit 2.500, betalt 10.000)
{
  const r6: InvoiceTotalsRow[] = [
    { id: 'f6', invoice_type: 'standard', status: 'paid', final_amount: 12500, amount_paid: 10000, currency: 'DKK', paid_at: '2026-10-05T10:00:00Z' },
    { id: 'f6c', invoice_type: 'credit', status: 'sent', final_amount: -2500, credit_of_invoice_id: 'f6', currency: 'DKK' },
    // ældre manuelt markeret betalt uden indbetalingsrække → beløb efter kreditnota
    { id: 'f6m', invoice_type: 'standard', status: 'paid', final_amount: 1000, amount_paid: 0, currency: 'DKK', paid_at: '2026-10-06T10:00:00Z' },
    { id: 'f6mc', invoice_type: 'credit', status: 'sent', final_amount: -200, credit_of_invoice_id: 'f6m', currency: 'DKK' },
  ]
  const t6 = computeInvoiceTotals(r6, now)
  ok(t6.paidThisMonth === 10800, 'FIN-6: betalt denne måned = indbetalt 10.000 + (1.000 − 200)', String(t6.paidThisMonth))
}
// FIN-11 (2026-10-17): 0,01 kr afrundingsrest er ikke forfalden
{
  const r11: InvoiceTotalsRow[] = [
    { id: 'f11', invoice_type: 'standard', status: 'sent', final_amount: 3.78, currency: 'DKK', due_date: '2026-10-01' },
    { id: 'f11c', invoice_type: 'credit', status: 'sent', final_amount: -3.77, credit_of_invoice_id: 'f11', currency: 'DKK' },
  ]
  const t11 = computeInvoiceTotals(r11, now)
  ok(t11.overdueCount === 0 && t11.overdue.length === 0, 'FIN-11: 0,01 kr rest tælles ikke som forfalden', String(t11.overdueCount))
}

// FC-5 (2026-10-20): "betalt denne måned" = faktiske indbetalinger i den danske kalendermåned (delbetalinger med)
{
  const rows: InvoiceTotalsRow[] = [
    // betalt 49.000 i sept + 1.000 i okt; paid_at i okt → kun 1.000 hører til oktober
    { id: 'p1', invoice_type: 'standard', status: 'paid', final_amount: 50000, amount_paid: 50000, currency: 'DKK', paid_at: '2026-10-02T09:00:00Z' },
    // delbetaling på en stadig sendt faktura → tæller i oktober
    { id: 'p2', invoice_type: 'standard', status: 'sent', final_amount: 8000, amount_paid: 3000, currency: 'DKK', due_date: '2026-11-01' },
    // ældre manuelt markeret betalt uden betalingsrække → fakturabeløbet i paid_at-måneden
    { id: 'p3', invoice_type: 'standard', status: 'paid', final_amount: 2500, amount_paid: 0, currency: 'DKK', paid_at: '2026-10-05T09:00:00Z' },
    // EUR-faktura — ikke kroner
    { id: 'p4', invoice_type: 'standard', status: 'sent', final_amount: 1000, amount_paid: 1000, currency: 'EUR' },
  ]
  const payments = [
    { invoice_id: 'p1', amount: 49000, recorded_at: '2026-09-28T10:00:00Z' },
    { invoice_id: 'p1', amount: 1000, recorded_at: '2026-10-02T09:00:00Z' },
    { invoice_id: 'p2', amount: 3000, recorded_at: '2026-10-10T09:00:00Z' },
    { invoice_id: 'p4', amount: 1000, recorded_at: '2026-10-11T09:00:00Z' },
    // 1/10 kl. 00:30 dansk tid = 30/9 22:30 UTC → oktober
    { invoice_id: 'p2', amount: 0, recorded_at: '2026-09-30T22:30:00Z' },
  ]
  const t = computeInvoiceTotals(rows, now, payments)
  ok(t.paidThisMonth === 6500, 'FC-5: 1.000 (okt-del) + 3.000 (delbetaling) + 2.500 (ældre uden række); sept-del og EUR ikke med', String(t.paidThisMonth))
  const legacy = computeInvoiceTotals(rows, now)
  ok(legacy.paidThisMonth === 52500, 'uden betalingsrækker: gammel regel (bagudkompatibel)', String(legacy.paidThisMonth))
}

console.log(bad ? `\n${bad} FAIL` : '\nALL PASS')
process.exit(bad ? 1 : 0)
