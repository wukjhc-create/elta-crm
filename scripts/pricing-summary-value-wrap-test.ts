/**
 * Tallene på prisoversigtens kort ombrydes. Udtrykket med isText er uændret.
 *   npx tsx scripts/pricing-summary-value-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate(null) === '', 'tom dato bliver')
ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-summary-value"')
const row = at >= 0 ? view.slice(at - 120, at + 90) : ''
ok(row.includes('break-words min-w-0'), 'tallet ombrydes')
ok(row.includes('{isText ? value : value}'), 'isText-udtrykket er uændret')
ok(row.includes('${valueColor}'), 'farven kommer stadig fra valueColor')
ok(view.includes('value={summary.criticalAlerts}'), 'kritiske tal bliver')
ok(view.includes('value={summary.totalAlerts}'), 'totalen bliver')
ok(view.includes('value={summary.priceIncreases}'), 'stigninger bliver')
ok(view.includes('value={summary.affectedOffers}'), 'påvirkede tal bliver')
ok(view.includes('data-testid="pricing-summary-label"'), 'etiketten bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-summary-value-wrap-test')
