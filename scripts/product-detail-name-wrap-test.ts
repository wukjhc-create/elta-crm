/**
 * Produktnavnet på produktdetaljen ombrydes. {productResult.data.name} er uændret.
 *   npx tsx scripts/product-detail-name-wrap-test.ts
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
const at = view.indexOf('data-testid="product-detail-name"')
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'navnet ombrydes')
ok(row.includes('{productResult.data.name}'), 'navnet er uændret')
ok(row.includes('text-2xl font-bold'), 'stoerrelsen bliver')
const skuAt = view.indexOf('{productResult.data.sku}')
const skuRow = skuAt >= 0 ? view.slice(skuAt - 80, skuAt + 40) : ''
ok(skuRow.includes('{productResult.data.sku}'), 'sku bliver')
ok(!skuRow.includes('break-words'), 'sku-linjen venter')
ok(view.includes('Det tælles ikke som at produktet mangler.'), 'fejlteksten bliver')
ok(view.includes('href="/dashboard/products"'), 'tilbage-linket bliver')

const client = readFileSync(join('src', 'app', 'dashboard', 'products', '[id]', 'product-detail-client.tsx'), 'utf8')
ok(client.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(client.includes('formatCurrency(product.cost_price)'), 'kostprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-detail-name-wrap-test')
