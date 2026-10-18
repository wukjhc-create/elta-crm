/**
 * Overskriften på det tomme katalog ombrydes. De to sætninger er uændret.
 *   npx tsx scripts/products-empty-title-wrap-test.ts
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
const at = view.indexOf('data-testid="products-empty-title"')
const row = at >= 0 ? view.slice(at - 120, at + 180) : ''
ok(row.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(row.includes('Ingen produkter matcher søgningen'), 'filteroverskriften er uændret')
ok(row.includes('Ingen produkter fundet'), 'tomoverskriften er uændret')
ok(row.includes('hasFilter'), 'valget bliver')
ok(view.includes('data-testid="products-empty-text"'), 'broedteksten bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  products-empty-title-wrap-test')
