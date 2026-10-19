/**
 * Varenummeret på prisadvarslens mobilkort ombrydes. SKU er uændret.
 *   npx tsx scripts/pricing-alert-sku-mobile-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-sku-mobile"')
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('break-all break-words min-w-0'), 'varenummeret ombrydes')
ok(row.includes('{alert.supplier_sku}'), 'sku er uændret')
const desk = view.indexOf('data-testid="pricing-alert-sku"')
const deskRow = desk >= 0 ? view.slice(desk - 120, desk + 80) : ''
ok(deskRow.includes('break-all break-words min-w-0'), 'skrivebordet bliver')
ok(deskRow.includes('{alert.supplier_sku}'), 'skrivebords-sku er uændret')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(view.includes('formatCurrency(alert.new_price)'), 'ny pris bliver')
ok(view.split('{alert.supplier_sku}').length - 1 === 2, 'to varenumre')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-sku-mobile-wrap-test')
