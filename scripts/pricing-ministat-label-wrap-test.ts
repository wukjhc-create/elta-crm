/**
 * Etiketterne på prisstatistikkens tal ombrydes. Tallene er uændret.
 *   npx tsx scripts/pricing-ministat-label-wrap-test.ts
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
ok(formatDate(undefined) === '', 'manglende dato bliver')
ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-ministat-label"')
const row = at >= 0 ? view.slice(at - 120, at + 50) : ''
ok(row.includes('break-words min-w-0'), 'etiketten ombrydes')
ok(row.includes('>{label}<'), 'etiketten kommer stadig fra label')
ok(view.includes("${warn ? 'text-amber-600' : 'text-gray-900'}"), 'advarselsfarven er uændret')
ok(view.includes('data-testid="pricing-ministat-value">{value}</div>'), 'tallet er uændret')
ok(view.includes('label="Produkter" value={stat.total_products}'), 'Produkter bliver')
ok(view.includes('label="Prisændringer" value={stat.products_with_price_changes}'), 'Prisændringer bliver')
ok(view.includes('label="Forældede" value={stat.stale_products}'), 'Forældede bliver')
ok(view.includes('label="Gns. stigning" value={`${stat.average_price_increase.toFixed(1)}%`}'), 'Gns. stigning bliver')
ok(view.includes('data-testid="pricing-movement-label"'), 'prisbevægelse bliver')
ok(view.includes('data-testid="pricing-sync-date"'), 'synk-datoen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-ministat-label-wrap-test')
