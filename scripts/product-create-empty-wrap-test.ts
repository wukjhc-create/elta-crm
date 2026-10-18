/**
 * Knappen Opret produkt ombrydes. setShowCreateDialog er uændret.
 *   npx tsx scripts/product-create-empty-wrap-test.ts
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
const at = view.indexOf('data-testid="product-create-empty"')
const row = at >= 0 ? view.slice(at - 120, at + 160) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes('Opret produkt'), 'ordet er uændret')
ok(row.includes('setShowCreateDialog(true)'), 'dialogen bliver')
ok(view.split('Opret produkt').length - 1 === 1, 'en opret-knap')
const header = view.indexOf('data-testid="product-create"')
const headerRow = header >= 0 ? view.slice(header, header + 160) : ''
ok(headerRow.includes('Nyt produkt'), 'ny-knappen bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-create-empty-wrap-test')
