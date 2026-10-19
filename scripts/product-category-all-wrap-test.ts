/**
 * Valget Alle kategorier ombrydes. value all er uændret.
 *   npx tsx scripts/product-category-all-wrap-test.ts
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
const at = view.indexOf('data-testid="product-category-all"')
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'valget ombrydes')
ok(row.includes('Alle kategorier'), 'ordene er uændrede')
ok(row.includes('value="all"'), 'value all bliver')
ok(view.includes('placeholder="Alle kategorier"'), 'pladsholderen venter')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-category-all-wrap-test')
