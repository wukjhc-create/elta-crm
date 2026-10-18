/**
 * Kolonneoverskrifterne i produktkataloget ombrydes. Ordene er uændret.
 *   npx tsx scripts/product-columns-wrap-test.ts
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
const heads = [
  ['product-col-name', '>Produkt<'],
  ['product-col-sku', '>SKU<'],
  ['product-col-category', '>Kategori<'],
  ['product-col-cost', '>Kostpris<'],
  ['product-col-list', '>Listepris<'],
  ['product-col-status', '>Status<'],
] as const
for (const [id, word] of heads) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 140, at + 80) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes(word), `${id} ordet er uændret`)
}
const costAt = view.indexOf('data-testid="product-col-cost"')
const costRow = costAt >= 0 ? view.slice(costAt - 140, costAt + 40) : ''
ok(costRow.includes('canSeeCost'), 'kost-kolonnen kraever canSeeCost')
ok(costRow.includes('text-right'), 'kost-kolonnen er hoejrestillet')
const listAt = view.indexOf('data-testid="product-col-list"')
const listRow = listAt >= 0 ? view.slice(listAt - 80, listAt + 40) : ''
ok(listRow.includes('text-right'), 'listepris-kolonnen er hoejrestillet')
ok(view.includes('<TableHead className="w-[50px]"></TableHead>'), 'handlingskolonnen bliver tom')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-columns-wrap-test')
