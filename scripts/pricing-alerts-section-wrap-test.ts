/**
 * Prisadvarslens afsnit kan krympe. Navn og procent er uændrede.
 *   npx tsx scripts/pricing-alerts-section-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alerts-section"')
const row = at >= 0 ? view.slice(at - 80, at + 2800) : ''
ok(row.includes('space-y-3 min-w-0'), 'afsnittet kan krympe')
ok(row.includes('{alert.product_name}'), 'navnet er uændret')
ok(row.includes("{isIncrease ? '+' : ''}{alert.change_percentage.toFixed(1)}%"), 'procenten er uændret')
ok(view.includes('text-right text-gray-500">{formatCurrency(alert.old_price)}'), 'gammel pris bliver')
ok(view.includes('text-right font-medium">{formatCurrency(alert.new_price)}'), 'ny pris bliver')
ok(view.split('{alert.product_name}').length - 1 === 2, 'to navne')
ok(!view.includes('className="space-y-3"'), 'kun dette afsnit')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alerts-section-wrap-test')
