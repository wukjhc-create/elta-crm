/**
 * Menupunktet Rediger i kataloget ombrydes. setEditingProduct er uændret.
 *   npx tsx scripts/product-menu-edit-wrap-test.ts
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
const at = view.indexOf('data-testid="product-menu-edit"')
const row = at >= 0 ? view.slice(at - 120, at + 220) : ''
ok(row.includes('break-words min-w-0'), 'menupunktet ombrydes')
ok(row.includes('Rediger'), 'ordet er uændret')
ok(row.includes('setEditingProduct(product)'), 'redigering bliver')
ok(view.includes('className="text-blue-700" aria-label={`Rediger ${product.name}`}>Rediger</button>'), 'mobilknappen venter')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-menu-edit-wrap-test')
