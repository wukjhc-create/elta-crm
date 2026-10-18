/**
 * Fejlteksten når kataloget ikke kan hentes ombrydes. Sætningen er uændret.
 *   npx tsx scripts/products-load-error-wrap-test.ts
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
const at = view.indexOf('data-testid="products-load-error"')
const row = at >= 0 ? view.slice(at - 120, at + 120) : ''
ok(row.includes('break-words min-w-0'), 'fejlteksten ombrydes')
ok(row.includes('{loadError}. Det tælles ikke som ingen produkter.'), 'saetningen er uændret')
ok(view.includes('data-testid="product-catalog-title"'), 'overskriften bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  products-load-error-wrap-test')
