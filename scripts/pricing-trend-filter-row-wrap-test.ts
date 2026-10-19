/**
 * Leverandørfilterets række på pristendenser kan ombrydes. Vælgeren er uændret.
 *   npx tsx scripts/pricing-trend-filter-row-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-trend-filter-row"')
const row = at >= 0 ? view.slice(at - 180, at + 800) : ''
ok(row.includes('flex-wrap min-w-0'), 'raekken kan ombrydes')
ok(row.includes('data-testid="pricing-trend-supplier-select"'), 'vaelgeren bliver')
ok(row.includes('value={selectedSupplierId}'), 'vaerdien er uændret')
ok(row.includes('onSupplierChange(e.target.value)'), 'skiftet er uændret')
ok(row.includes('>Vælg leverandør...</option>'), 'teksten er uændret')
ok(view.includes('formatCurrency(trend.current_price)'), 'trendprisen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-filter-row-wrap-test')
