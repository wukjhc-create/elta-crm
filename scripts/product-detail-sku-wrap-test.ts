/**
 * SKU-linjen på produktdetaljen ombrydes. {productResult.data.sku} er uændret.
 *   npx tsx scripts/product-detail-sku-wrap-test.ts
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

const view = readFileSync(join('src', 'app', 'dashboard', 'products', '[id]', 'page.tsx'), 'utf8')
const at = view.indexOf('data-testid="product-detail-sku"')
const row = at >= 0 ? view.slice(at - 80, at + 90) : ''
ok(row.includes('break-words min-w-0'), 'sku-linjen ombrydes')
ok(row.includes('SKU: {productResult.data.sku}'), 'sku er uændret')
ok(row.includes('text-gray-500'), 'farven bliver')
ok(view.includes('data-testid="product-detail-name"'), 'navnet bliver')
ok(view.includes('{productResult.data.name}'), 'navnevaerdien bliver')
ok(view.includes('href="/dashboard/products"'), 'tilbage-linket bliver')

const client = readFileSync(join('src', 'app', 'dashboard', 'products', '[id]', 'product-detail-client.tsx'), 'utf8')
ok(client.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(client.includes('formatCurrency(product.cost_price)'), 'kostprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-detail-sku-wrap-test')
