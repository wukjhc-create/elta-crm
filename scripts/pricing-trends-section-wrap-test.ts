/**
 * Pristendensens afsnit kan krympe. Pris og navn er uændrede.
 *   npx tsx scripts/pricing-trends-section-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-trends-section"')
const row = at >= 0 ? view.slice(at - 80, at + 3600) : ''
ok(row.includes('space-y-4 min-w-0'), 'afsnittet kan krympe')
ok(row.includes('{trend.product_name}'), 'navnet er uændret')
ok(row.includes('{formatCurrency(trend.current_price)}'), 'prisen er uændret')
ok(view.includes('text-right font-medium">{formatCurrency(trend.current_price)}'), 'skrivebordets pris bliver')
ok(view.split('{trend.product_name}').length - 1 === 2, 'to navne')
ok(!view.includes('className="space-y-4"'), 'kun dette afsnit')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trends-section-wrap-test')
