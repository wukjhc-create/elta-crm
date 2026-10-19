/**
 * Produktcellen på prisadvarslens skrivebord ombrydes. Navnet og priserne er uændrede.
 *   npx tsx scripts/pricing-alert-product-cell-wrap-test.ts
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

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-alert-product-cell"')
const row = at >= 0 ? view.slice(at - 40, at + 900) : ''
ok(row.includes('break-words min-w-0'), 'cellen ombrydes')
ok(row.includes('{alert.product_name}'), 'navnet er uændret')
ok(row.includes('formatCurrency(alert.old_price)'), 'gammel pris er uændret')
ok(row.includes('formatCurrency(alert.new_price)'), 'ny pris er uændret')
ok(view.includes('{alert.supplier_sku}'), 'varenummeret bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-product-cell-wrap-test')
