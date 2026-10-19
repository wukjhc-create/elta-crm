/**
 * Leverandørvælgeren på pristendenser ombrydes.
 * Værdien og teksten Vælg leverandør er uændrede.
 *   npx tsx scripts/pricing-trend-supplier-select-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-trend-supplier-select"')
const row = at >= 0 ? view.slice(at - 220, at + 280) : ''
ok(row.includes('break-words min-w-0'), 'vaelgeren ombrydes')
ok(row.includes('value={selectedSupplierId}'), 'vaerdien er uaendret')
ok(row.includes('onChange={(e) => onSupplierChange(e.target.value)}'), 'skiftet er uaendret')
ok(row.includes('Vælg leverandør...'), 'teksten er uaendret')
ok(view.includes('formatCurrency(trend.current_price)'), 'trendprisen bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(view.includes('formatCurrency(alert.new_price)'), 'ny pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-supplier-select-wrap-test')
