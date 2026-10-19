/**
 * Varenummeret på prisadvarslens skrivebord ombrydes. SKU er uændret.
 *   npx tsx scripts/pricing-alert-sku-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-sku"')
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
ok(row.includes('break-all break-words min-w-0'), 'varenummeret ombrydes')
ok(row.includes('{alert.supplier_sku}'), 'sku er uændret')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(view.includes('formatCurrency(alert.new_price)'), 'ny pris bliver')
ok(view.includes('text-xs text-gray-400 break-all break-words min-w-0" data-testid="pricing-alert-sku-mobile">{alert.supplier_sku}'), 'mobil-sku bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-sku-wrap-test')
