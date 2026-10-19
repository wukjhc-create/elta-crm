/**
 * Søgefeltets pladsholder ombrydes. Teksten Søg efter produkter... er uændret.
 *   npx tsx scripts/product-search-wrap-test.ts
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
const at = view.indexOf('data-testid="product-search"')
const row = at >= 0 ? view.slice(at - 280, at + 40) : ''
ok(row.includes('break-words min-w-0'), 'soegefeltet ombrydes')
ok(row.includes('placeholder="Søg efter produkter..."'), 'pladsholderen er uændret')
ok(row.includes('onChange={(e) => setSearch(e.target.value)}'), 'soegningen bliver')
ok(row.includes('aria-label="Søg efter produkter"'), 'etiketten bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-search-wrap-test')
