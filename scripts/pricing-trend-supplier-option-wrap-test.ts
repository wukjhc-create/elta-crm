/**
 * Optionen Vælg leverandør på pristendenser ombrydes. Teksten er uændret.
 *   npx tsx scripts/pricing-trend-supplier-option-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-trend-supplier-option"')
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'optionen ombrydes')
ok(row.includes('>Vælg leverandør...</option>'), 'teksten er uændret')
ok(row.includes('value=""'), 'tom vaerdi bliver')
ok(view.includes('value={selectedSupplierId}'), 'valget bliver')
ok(view.includes('formatCurrency(trend.current_price)'), 'trendprisen bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(view.includes('formatCurrency(alert.new_price)'), 'ny pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-supplier-option-wrap-test')
