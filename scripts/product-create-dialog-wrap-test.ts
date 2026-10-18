/**
 * Dialogen Opret nyt produkt ombrydes. Ordene er uændret.
 *   npx tsx scripts/product-create-dialog-wrap-test.ts
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
const line = '<DialogTitle className="break-words min-w-0">Opret nyt produkt</DialogTitle>'
ok(view.includes(line), 'dialogen ombrydes')
ok(view.includes('setShowCreateDialog'), 'dialogen bliver')
ok(view.includes('<DialogTitle className="break-words min-w-0">Rediger produkt</DialogTitle>'), 'rediger-dialogen ombrydes')
ok(view.includes('data-testid="product-create-empty"'), 'opret-knappen bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-create-dialog-wrap-test')
