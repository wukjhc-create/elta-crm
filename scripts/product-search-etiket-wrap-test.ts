/**
 * Søgefeltets etiket ombrydes. Teksten Søg efter produkter er uændret.
 *   npx tsx scripts/product-search-etiket-wrap-test.ts
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
const at = view.indexOf('aria-label="Søg efter produkter"')
const row = at >= 0 ? view.slice(at, at + 320) : ''
ok(row.startsWith('aria-label="Søg efter produkter"'), 'etiketten er uændret')
ok(!row.startsWith('aria-label="Søg efter produkter..."'), 'etiketten har ikke pladsholderens prikker')
ok(row.includes('className="pl-10 break-words min-w-0"'), 'etiketten ombrydes')
ok(row.includes('placeholder="Søg efter produkter..."'), 'pladsholderen bliver')
ok(row.includes('data-testid="product-search"'), 'soegefeltet bliver')
ok(row.includes('onChange={(e) => setSearch(e.target.value)}'), 'soegningen bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-search-etiket-wrap-test')
