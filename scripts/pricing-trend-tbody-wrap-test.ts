/**
 * Pristendensens tabelkrop kan krympe. Pris og navn er uændrede.
 *   npx tsx scripts/pricing-trend-tbody-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-trend-tbody"')
const row = at >= 0 ? view.slice(at - 80, at + 2800) : ''
ok(row.includes('className="min-w-0" data-testid="pricing-trend-tbody"'), 'kroppen kan krympe')
ok(row.includes('{trend.product_name}'), 'navnet er uændret')
ok(row.includes('text-right font-medium">{formatCurrency(trend.current_price)}'), 'prisen er uændret')
ok(view.split('<tbody>').length - 1 === 0, 'ingen upakket tabelkrop')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-tbody-wrap-test')
