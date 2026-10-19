/**
 * Oversigtskortet kan krympe. Tallene er uændrede.
 *   npx tsx scripts/pricing-summary-card-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-summary-card"')
const row = at >= 0 ? view.slice(at - 120, at + 700) : ''
ok(row.includes('min-w-0'), 'kortet kan krympe')
ok(row.includes('{isText ? value : value}'), 'isText-udtrykket er uændret')
ok(row.includes('${valueColor}'), 'farven kommer stadig fra valueColor')
ok(view.includes('value={summary.criticalAlerts}'), 'kritiske tal er uændrede')
ok(view.includes('value={summary.totalAlerts}'), 'totalen er uændret')
ok(view.includes('value={summary.priceIncreases}'), 'stigninger er uændrede')
ok(view.includes('value={summary.affectedOffers}'), 'påvirkede tal er uændrede')
ok(view.includes('label="Kritiske advarsler"'), 'etiketten bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-summary-card-wrap-test')
