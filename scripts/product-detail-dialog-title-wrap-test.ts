/**
 * Dialogtitlen Rediger produkt ombrydes. Ordene er uændrede.
 * DialogTitle tager ikke data-testid.
 *   npx tsx scripts/product-detail-dialog-title-wrap-test.ts
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
const at = view.indexOf('<DialogTitle className="break-words min-w-0">Rediger produkt</DialogTitle>')
ok(at >= 0, 'titlen ombrydes')
ok(view.includes('Rediger produkt'), 'ordene er uændrede')
ok(!view.includes('<DialogTitle data-testid='), 'titlen har ikke data-testid')
ok(view.includes('onClick={() => setShowEditDialog(true)}'), 'rediger bliver')
ok(view.includes('formatCurrency(product.list_price)'), 'listeprisen bliver')
ok(view.includes('formatCurrency(product.cost_price)'), 'kostprisen bliver')
ok(view.includes('((product.list_price - product.cost_price) / product.cost_price) * 100'), 'avanceformlen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  product-detail-dialog-title-wrap-test')
