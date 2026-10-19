/**
 * Prisbevægelsens blok kan krympe. Procenterne er uændrede.
 *   npx tsx scripts/pricing-movement-block-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-movement-block"')
const row = at >= 0 ? view.slice(at - 80, at + 1800) : ''
ok(row.includes('mt-3 min-w-0'), 'blokken kan krympe')
ok(row.includes('+{stat.average_price_increase.toFixed(1)}%'), 'stigningen er uændret')
ok(row.includes('-{stat.average_price_decrease.toFixed(1)}%'), 'faldet er uændret')
ok(row.includes('Math.min(stat.average_price_increase * 5, 50)'), 'stigningsbredden er uændret')
ok(row.includes('Math.min(stat.average_price_decrease * 5, 50)'), 'faldsbredden er uændret')
ok(view.includes('value={stat.total_products}'), 'produkttallet bliver')
ok(!view.includes('className="mt-3"'), 'kun denne blok')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-movement-block-wrap-test')
