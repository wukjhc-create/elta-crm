/**
 * Leverandørnavnet i pristendensens vælger kan ombrydes. Navnet og value er uændrede.
 *   npx tsx scripts/pricing-trend-supplier-choice-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-trend-supplier-choice"')
const row = at >= 0 ? view.slice(at - 220, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'navnet kan ombrydes')
ok(row.includes('value={s.supplier_id}'), 'vaerdien er uændret')
ok(row.includes('{s.supplier_name}'), 'navnet er uændret')
ok(view.includes('data-testid="pricing-trend-supplier-option"'), 'pladsholderen bliver')
ok(view.includes('>Vælg leverandør...</option>'), 'pladsholderteksten bliver')
ok(view.includes('formatCurrency(trend.current_price)'), 'trendprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-supplier-choice-wrap-test')
