/**
 * Mobilknappen Rediger i kataloget ombrydes. Ordet er uændret.
 *   npx tsx scripts/product-edit-mobile-wrap-test.ts
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
const at = view.indexOf('data-testid="product-edit-mobile"')
const row = at >= 0 ? view.slice(at - 180, at + 140) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes('>Rediger</button>'), 'ordet er uændret')
ok(row.includes('setEditingProduct(product)'), 'redigering bliver')
ok(row.includes('aria-label={`Rediger ${product.name}`}'), 'navnet bliver')
ok(view.includes('data-testid="product-menu-edit"'), 'menuen bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-edit-mobile-wrap-test')
