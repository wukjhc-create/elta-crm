/**
 * Etiketterne Kostpris og Listepris på katalogets mobilkort ombrydes. Ordene er uændret.
 *   npx tsx scripts/product-price-labels-wrap-test.ts
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
const labels = [
  ['product-cost-label-mobile', '>Kostpris<', 'storedCostText(product.cost_price)'],
  ['product-list-label-mobile', '>Listepris<', 'formatCurrency(product.list_price)'],
] as const
for (const [id, word, value] of labels) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 220, at + 220) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes(word), `${id} ordet er uændret`)
  ok(row.includes(value), `${id} vaerdien bliver`)
}
const costAt = view.indexOf('data-testid="product-cost-label-mobile"')
const costRow = costAt >= 0 ? view.slice(costAt - 220, costAt) : ''
ok(costRow.includes('canSeeCost'), 'kostetiketten kraever canSeeCost')
ok(view.includes('data-testid="product-col-cost"'), 'kolonneoverskriften bliver')
ok(view.includes('data-testid="product-list-price"'), 'listeprisen i tabellen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-price-labels-wrap-test')
