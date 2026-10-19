/**
 * Etiketten Kostpris på produktdetaljen ombrydes. Ordet og formatCurrency(product.cost_price) er uændrede.
 *   npx tsx scripts/product-detail-cost-label-wrap-test.ts
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

const view = readFileSync(join('src', 'app', 'dashboard', 'products', '[id]', 'product-detail-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="product-detail-cost-label"')
const row = at >= 0 ? view.slice(at - 220, at + 180) : ''
ok(row.includes('break-words min-w-0'), 'etiketten ombrydes')
ok(row.includes('>Kostpris</span>'), 'ordet er uændret')
ok(row.includes('formatCurrency(product.cost_price)'), 'kostprisen er uændret')
ok(row.includes('product.cost_price &&'), 'kost vises kun naar den findes')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(view.includes('((product.list_price - product.cost_price) / product.cost_price) * 100'), 'avanceformlen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-detail-cost-label-wrap-test')
