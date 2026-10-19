/**
 * Leverandørnavnet på prisadvarslens mobilkort kan krympe. Navnet er uændret.
 *   npx tsx scripts/pricing-alert-supplier-mobile-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-supplier-mobile"')
const row = at >= 0 ? view.slice(at - 90, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'navnet kan krympe')
ok(row.includes('{alert.supplier_name}'), 'navnet er uændret')
ok(view.includes('data-testid="pricing-alert-supplier-cell"'), 'skrivebordet bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(view.includes('formatCurrency(alert.new_price)'), 'ny pris bliver')
ok(view.split('{alert.supplier_name}').length - 1 === 2, 'to navne')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-supplier-mobile-wrap-test')
