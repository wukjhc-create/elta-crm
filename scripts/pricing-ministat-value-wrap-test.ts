/**
 * Tallene på prisstatistikken ombrydes. Værdierne er uændret.
 *   npx tsx scripts/pricing-ministat-value-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-ministat-value"')
const row = at >= 0 ? view.slice(at - 160, at + 50) : ''
ok(row.includes('break-words min-w-0'), 'tallet ombrydes')
ok(row.includes('>{value}<'), 'værdien kommer stadig fra value')
ok(row.includes("${warn ? 'text-amber-600' : 'text-gray-900'}"), 'advarselsfarven er uændret')
ok(view.includes('value={stat.total_products}'), 'produktallet bliver')
ok(view.includes('value={stat.products_with_price_changes}'), 'prisændringer bliver')
ok(view.includes('value={stat.stale_products}'), 'forældede bliver')
ok(view.includes('value={`${stat.average_price_increase.toFixed(1)}%`}'), 'gennemsnit bliver')
ok(view.includes('data-testid="pricing-ministat-label"'), 'etiketten bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-ministat-value-wrap-test')
