/**
 * Prisovervågningens side kan krympe. Tallene er uændrede.
 *   npx tsx scripts/pricing-page-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-page"')
const row = at >= 0 ? view.slice(at - 80, at + 2200) : ''
ok(row.includes('space-y-6 min-w-0'), 'siden kan krympe')
ok(row.includes('value={summary.criticalAlerts}'), 'kritiske tal er uændrede')
ok(row.includes('value={summary.totalAlerts}'), 'totalen er uændret')
ok(row.includes('value={summary.priceIncreases}'), 'stigninger er uændrede')
ok(row.includes('value={summary.affectedOffers}'), 'påvirkede tal er uændrede')
ok(row.includes('label="Kritiske advarsler"'), 'etiketten bliver')
ok(view.includes('{isText ? value : value}'), 'isText-udtrykket bliver')
ok(!view.includes('className="space-y-6"'), 'kun denne side')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-page-wrap-test')
