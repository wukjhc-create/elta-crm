/**
 * Oversigtskortets etikettrække kan krympe. Etiketten er uændret.
 *   npx tsx scripts/pricing-summary-label-row-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-summary-label-row"')
const row = at >= 0 ? view.slice(at - 120, at + 280) : ''
ok(row.includes('min-w-0'), 'raekken kan krympe')
ok(row.includes('data-testid="pricing-summary-label"'), 'etiketmaerket bliver')
ok(row.includes('>{label}<'), 'etiketten kommer stadig fra label')
ok(view.includes('label="Kritiske advarsler"'), 'Kritiske advarsler bliver')
ok(view.includes('value={summary.criticalAlerts}'), 'kritiske tal er uændrede')
ok(view.includes('value={summary.totalAlerts}'), 'totalen er uændret')
ok(view.includes('value={summary.priceIncreases}'), 'stigninger er uændrede')
ok(view.includes('value={summary.affectedOffers}'), 'påvirkede tal er uændrede')
ok(view.includes('{isText ? value : value}'), 'isText-udtrykket bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-summary-label-row-wrap-test')
