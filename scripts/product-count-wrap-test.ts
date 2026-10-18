/**
 * Antallet over produktkataloget ombrydes. Sætningen og total er uændret.
 *   npx tsx scripts/product-count-wrap-test.ts
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
const at = view.indexOf('data-testid="product-count"')
const row = at >= 0 ? view.slice(at - 80, at + 280) : ''
ok(row.includes('break-words min-w-0'), 'antallet ombrydes')
ok(row.includes('Antallet kunne ikke hentes. Det tælles ikke som 0 produkter.'), 'saetningen er uændret')
ok(row.includes('`${total} ${total === 1 ? \'produkt\' : \'produkter\'}`'), 'total er uændret')
ok(row.includes('loadError'), 'fejlen bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-count-wrap-test')
