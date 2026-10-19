/**
 * Fejlteksten når produktdetaljen ikke kan hentes ombrydes. Sætningen er uændret.
 *   npx tsx scripts/product-detail-error-wrap-test.ts
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
const at = view.indexOf('data-testid="product-detail-load-error"')
const row = at >= 0 ? view.slice(at - 80, at + 160) : ''
ok(row.includes('break-words min-w-0'), 'fejlteksten ombrydes')
ok(row.includes('{productResult.error}. Det tælles ikke som at produktet mangler.'), 'sætningen er uændret')
ok(view.includes('data-testid="product-detail-name"'), 'navnet bliver')
ok(view.includes('{productResult.data.name}'), 'navnevaerdien bliver')
ok(view.includes('notFound()'), 'ukendt produkt bliver')

const client = readFileSync(join('src', 'app', 'dashboard', 'products', '[id]', 'product-detail-client.tsx'), 'utf8')
ok(client.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(client.includes('formatCurrency(product.cost_price)'), 'kostprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-detail-error-wrap-test')
