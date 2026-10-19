/**
 * Knappen Rediger på produktdetaljen ombrydes. setShowEditDialog er uændret.
 *   npx tsx scripts/product-detail-edit-wrap-test.ts
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
const at = view.indexOf('data-testid="product-detail-edit"')
const row = at >= 0 ? view.slice(at - 120, at + 120) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes('onClick={() => setShowEditDialog(true)}'), 'handleren er uændret')
ok(row.includes('Rediger'), 'ordet er uændret')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(view.includes('formatCurrency(product.cost_price)'), 'kostprisen bliver')
ok(view.includes('((product.list_price - product.cost_price) / product.cost_price) * 100'), 'avanceformlen bliver')
ok(view.includes('onClick={handleDelete}'), 'slet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-detail-edit-wrap-test')
