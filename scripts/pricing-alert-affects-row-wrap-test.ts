/**
 * Påvirker-rækken på prisadvarslens skrivebord kan krympe. Tallene er uændrede.
 *   npx tsx scripts/pricing-alert-affects-row-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-affects-row"')
const row = at >= 0 ? view.slice(at - 120, at + 900) : ''
ok(row.includes('min-w-0'), 'rækken kan krympe')
ok(row.includes('{alert.affects_offers}'), 'tilbudstallet er uændret')
ok(row.includes('{alert.affects_calculations}'), 'kalkulationstallet er uændret')
ok(row.includes('alert.affects_offers > 0'), 'tilbuds-betingelsen bliver')
ok(row.includes('alert.affects_calculations > 0'), 'kalkule-betingelsen bliver')
ok(view.includes('text-right text-gray-500 break-words min-w-0" data-testid="pricing-alert-old-desktop">{formatCurrency(alert.old_price)}'), 'gammel pris bliver')
ok(view.includes('text-right font-medium">{formatCurrency(alert.new_price)}'), 'ny pris bliver')
ok(view.split('{alert.affects_offers}').length - 1 === 2, 'to tilbudstal')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-affects-row-wrap-test')
