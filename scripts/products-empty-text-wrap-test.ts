/**
 * Den tomme katalogtekst ombrydes. De to sætninger er uændret.
 *   npx tsx scripts/products-empty-text-wrap-test.ts
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
const at = view.indexOf('data-testid="products-empty-text"')
const row = at >= 0 ? view.slice(at - 80, at + 280) : ''
ok(row.includes('break-words min-w-0'), 'teksten ombrydes')
ok(row.includes('Prøv et andet navn, varenummer eller en anden kategori.'), 'filterteksten er uændret')
ok(row.includes('Kom i gang ved at oprette dit første produkt'), 'tomteksten er uændret')
ok(row.includes('hasFilter'), 'valget bliver')
ok(view.includes('Ingen produkter fundet'), 'overskriften venter')
ok(view.includes('onClick={clearFilters}'), 'ryd bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  products-empty-text-wrap-test')
