/**
 * Prisadvarslens mobilrække kan krympe. Navn og procent er uændrede.
 *   npx tsx scripts/pricing-alert-row-mobile-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-row-mobile"')
const row = at >= 0 ? view.slice(at - 180, at + 1600) : ''
ok(row.includes('min-w-0 break-words'), 'raekken kan krympe')
ok(row.includes('data-testid="pricing-alert-product-mobile"'), 'navnemaerket bliver')
ok(row.includes('{alert.product_name}'), 'navnet er uændret')
ok(row.includes('data-testid="pricing-alert-severity-mobile"'), 'alvorlighed bliver')
ok(row.includes("{isIncrease ? '+' : ''}{alert.change_percentage.toFixed(1)}%"), 'procenten er uændret')
ok(view.includes('data-testid="pricing-alert-severity"'), 'skrivebordet bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-row-mobile-wrap-test')
