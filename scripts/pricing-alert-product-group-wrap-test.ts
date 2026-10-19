/**
 * Produktgruppen på prisadvarslens mobilkort ombrydes. Navnet er uændret.
 *   npx tsx scripts/pricing-alert-product-group-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-product-group"')
const row = at >= 0 ? view.slice(at - 40, at + 360) : ''
ok(row.includes('min-w-0 break-words'), 'gruppen ombrydes')
ok(row.includes('data-testid="pricing-alert-product-mobile"'), 'navnemaerket bliver')
ok(row.includes('{alert.product_name}'), 'navnet er uændret')
ok(row.includes('data-testid="pricing-alert-sku-mobile"'), 'varenummeret bliver')
ok(view.includes('font-medium break-words max-w-[16rem] min-w-0" data-testid="pricing-alert-product-name"'), 'skrivebordet bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-product-group-wrap-test')
