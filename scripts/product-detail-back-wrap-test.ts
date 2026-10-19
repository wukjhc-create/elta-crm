/**
 * Tilbage-knappen på produktdetaljen ombrydes. href er uændret. Ingen ny tekst.
 *   npx tsx scripts/product-detail-back-wrap-test.ts
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

const page = readFileSync(join('src', 'app', 'dashboard', 'products', '[id]', 'page.tsx'), 'utf8')
const client = readFileSync(join('src', 'app', 'dashboard', 'products', '[id]', 'product-detail-client.tsx'), 'utf8')
const at = page.indexOf('data-testid="product-detail-back"')
const row = at >= 0 ? page.slice(at - 180, at + 80) : ''
ok(row.includes('href="/dashboard/products"'), 'href er uændret')
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes('variant="ghost"'), 'varianten er uændret')
ok(!row.includes('Tilbage'), 'ingen ny tekst')
ok(client.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(client.includes('formatCurrency(product.cost_price)'), 'kostprisen bliver')
ok(client.includes('((product.list_price - product.cost_price) / product.cost_price) * 100'), 'avanceformlen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-detail-back-wrap-test')
