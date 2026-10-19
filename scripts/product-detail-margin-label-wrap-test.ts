/**
 * Etiketten Avance på produktdetaljen ombrydes. Ordet og margin.toFixed(1) er uændrede.
 *   npx tsx scripts/product-detail-margin-label-wrap-test.ts
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
const at = view.indexOf('data-testid="product-detail-margin-label"')
const row = at >= 0 ? view.slice(at - 80, at + 220) : ''
ok(row.includes('break-words min-w-0'), 'etiketten ombrydes')
ok(row.includes('>Avance</span>'), 'ordet er uændret')
ok(row.includes('margin.toFixed(1)'), 'procenten er uændret')
ok(row.includes("margin >= 0 ? 'text-green-600' : 'text-red-600'"), 'farven er uændret')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(view.includes('formatCurrency(product.cost_price)'), 'kostprisen bliver')
ok(view.includes('((product.list_price - product.cost_price) / product.cost_price) * 100'), 'avanceformlen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-detail-margin-label-wrap-test')
