/**
 * Mobilknappen Slet i kataloget ombrydes. Ordet er uændret.
 *   npx tsx scripts/product-delete-mobile-wrap-test.ts
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
const at = view.indexOf('data-testid="product-delete-mobile"')
const row = at >= 0 ? view.slice(at - 160, at + 140) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes('>Slet</button>'), 'ordet er uændret')
ok(row.includes('handleDelete(product)'), 'sletning bliver')
ok(row.includes('aria-label={`Slet ${product.name}`}'), 'navnet bliver')
ok(view.includes('data-testid="product-menu-delete"'), 'menuen bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-delete-mobile-wrap-test')
