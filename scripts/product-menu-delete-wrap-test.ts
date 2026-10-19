/**
 * Menupunktet Slet i kataloget ombrydes. handleDelete er uændret.
 *   npx tsx scripts/product-menu-delete-wrap-test.ts
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
const at = view.indexOf('data-testid="product-menu-delete"')
const row = at >= 0 ? view.slice(at - 180, at + 160) : ''
ok(row.includes('break-words min-w-0'), 'menupunktet ombrydes')
ok(row.includes('text-red-600'), 'farven bliver')
ok(row.includes('Slet'), 'ordet er uændret')
ok(row.includes('handleDelete(product)'), 'sletning bliver')
ok(view.includes('className="text-red-600 break-words min-w-0" data-testid="product-delete-mobile" aria-label={`Slet ${product.name}`}>Slet</button>'), 'mobilknappen ombrydes')
ok(view.includes('data-testid="product-menu-edit"'), 'rediger-menuen bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-menu-delete-wrap-test')
