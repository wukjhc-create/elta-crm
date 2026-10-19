/**
 * Bindestregen for en manglende kategori ombrydes. Bindestregen er uændret.
 *   npx tsx scripts/product-category-missing-wrap-test.ts
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
const at = view.indexOf('data-testid="product-category-missing"')
const row = at >= 0 ? view.slice(at - 400, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'bindestregen ombrydes')
ok(row.includes('>-</span>'), 'bindestregen er uændret')
ok(row.includes('product.category ?'), 'valget bliver')
ok(view.includes("product.sku || '-'"), 'varenummerets bindestreg bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(view.includes('storedCostText(product.cost_price)'), 'kostteksten bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-category-missing-wrap-test')
