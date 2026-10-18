/**
 * Listeprisen i produktkataloget ombrydes. formatCurrency er uændret.
 *   npx tsx scripts/product-list-price-wrap-test.ts
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
const expr = '{formatCurrency(product.list_price)}'
for (const id of ['product-list-price-mobile', 'product-list-price']) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 120, at + 120) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes(expr), `${id} udtrykket er uændret`)
}
ok(view.split(expr).length - 1 === 2, 'to listepriser')
ok(view.includes('storedCostText(product.cost_price)'), 'kostteksten bliver')
ok(view.includes('{canSeeCost && ('), 'kost ligger bag canSeeCost')
ok(view.includes('>Listepris<'), 'ordet Listepris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-list-price-wrap-test')
