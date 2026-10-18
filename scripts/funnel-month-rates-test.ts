/**
 * Månedens sendt- og vinderrate i salgstragten. Ingen DB.
 *   npx tsx scripts/funnel-month-rates-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeSalesFunnel, funnelMonthRates } from '../src/lib/reports/sales-funnel'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

ok(funnelMonthRates({ offers_created: 0, offers_sent: 0, offers_accepted: 0 }).sent_rate == null, '0 oprettet er ikke 0 % sendt')
ok(funnelMonthRates({ offers_created: 4, offers_sent: 0, offers_accepted: 0 }).win_rate == null, '0 sendt er ikke 0 % vundet')
ok(funnelMonthRates({ offers_created: 4, offers_sent: 2, offers_accepted: 1 }).sent_rate === 50, '2 af 4 er 50 % sendt')
ok(funnelMonthRates({ offers_created: 4, offers_sent: 2, offers_accepted: 1 }).win_rate === 50, '1 af 2 er 50 % vundet')

const funnel = computeSalesFunnel({
  months: ['2026-10'],
  customers: [{ created_at: '2026-10-02T10:00:00Z' }],
  offers: [
    { created_at: '2026-10-03T10:00:00Z', sent_at: '2026-10-04T10:00:00Z', accepted_at: '2026-10-05T10:00:00Z', final_amount: 12500, tax_amount: 2500, is_proposal: false },
    { created_at: '2026-10-06T10:00:00Z', sent_at: null, accepted_at: null, final_amount: 1000, tax_amount: 200, is_proposal: false },
    { created_at: '2026-10-07T10:00:00Z', sent_at: '2026-10-07T11:00:00Z', accepted_at: '2026-10-07T12:00:00Z', final_amount: 999, tax_amount: 0, is_proposal: true },
  ],
  invoices: [],
})
const month = funnel.months[0]
const rates = funnelMonthRates(month)
ok(month.offers_created === 2 && month.offers_sent === 1 && month.offers_accepted === 1, 'forslag tæller ikke med', JSON.stringify(month))
ok(rates.sent_rate === 50 && rates.win_rate === 100, 'månedens rate følger de tal tragten allerede har', JSON.stringify(rates))
ok(rates.sent_rate === funnel.totals.sent_rate && rates.win_rate === funnel.totals.win_rate, 'én måned stemmer med totalen')
ok(month.accepted_value === 10000, 'accepteret værdi er stadig ekskl. moms', String(month.accepted_value))

const table = readFileSync(join('src', 'app', 'dashboard', 'reports', 'sales-funnel-table.tsx'), 'utf8')
ok(table.includes('data-testid="funnel-month-rates"'), 'måneden viser raterne')
ok(table.includes('funnelMonthRates(m)'), 'tabellen kalder den rene funktion')
ok(table.includes('Sendt-rate {pct(t.sent_rate)} af oprettede tilbud'), 'totalens tekst er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  funnel-month-rates-test')
