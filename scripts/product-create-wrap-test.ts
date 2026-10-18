/**
 * Knappen Nyt produkt ombrydes. setShowCreateDialog er uændret.
 *   npx tsx scripts/product-create-wrap-test.ts
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
const at = view.indexOf('data-testid="product-create"')
const row = at >= 0 ? view.slice(at - 120, at + 180) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes('Nyt produkt'), 'ordet er uændret')
ok(row.includes('setShowCreateDialog(true)'), 'dialogen bliver')
ok(view.split('Nyt produkt').length - 1 === 1, 'en ny-knap')
ok(view.split('setShowCreateDialog(true)').length - 1 === 2, 'opret-knappen bliver')
const emptyAt = view.indexOf('Opret produkt')
const empty = emptyAt >= 0 ? view.slice(emptyAt - 220, emptyAt + 20) : ''
ok(empty.includes('setShowCreateDialog(true)'), 'tom-knappen aabner dialogen')
ok(!empty.includes('data-testid="product-create"'), 'tom-knappen er en anden knap')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-create-wrap-test')
