/**
 * Overskriften Produktinformation på produktdetaljen ombrydes. Ordet er uændret.
 *   npx tsx scripts/product-detail-info-title-wrap-test.ts
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
const at = view.indexOf('data-testid="product-detail-info-title"')
const row = at >= 0 ? view.slice(at - 80, at + 180) : ''
ok(row.includes('flex items-center gap-2 break-words min-w-0'), 'overskriften ombrydes')
ok(row.includes('Produktinformation'), 'ordet er uændret')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(view.includes('formatCurrency(product.cost_price)'), 'kostprisen bliver')
ok(view.includes('((product.list_price - product.cost_price) / product.cost_price) * 100'), 'avanceformlen bliver')
ok(view.includes('>Priser<'), 'priser-ordet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-detail-info-title-wrap-test')
