/**
 * Knappen Ryd søgning ombrydes. clearFilters er uændret.
 *   npx tsx scripts/products-clear-filters-wrap-test.ts
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

const view = readFileSync(join('src', 'app', 'dashboard', 'products', 'products-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="products-clear-filters"')
const row = at >= 0 ? view.slice(at - 160, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes('Ryd søgning'), 'ordet er uændret')
ok(row.includes('onClick={clearFilters}'), 'rydningen bliver')
ok(view.split('Ryd søgning').length - 1 === 1, 'en ryd-knap')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  products-clear-filters-wrap-test')
