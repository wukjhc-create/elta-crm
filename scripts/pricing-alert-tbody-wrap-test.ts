/**
 * Prisadvarslens tabelkrop kan krympe. Navn og priser er uændrede.
 *   npx tsx scripts/pricing-alert-tbody-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-tbody"')
const row = at >= 0 ? view.slice(at - 80, at + 2800) : ''
ok(row.includes('className="min-w-0" data-testid="pricing-alert-tbody"'), 'kroppen kan krympe')
ok(row.includes('{alert.product_name}'), 'navnet er uændret')
ok(row.includes('text-right text-gray-500">{formatCurrency(alert.old_price)}'), 'gammel pris er uændret')
ok(row.includes('text-right font-medium">{formatCurrency(alert.new_price)}'), 'ny pris er uændret')
ok(view.split('<tbody>').length - 1 === 2, 'de andre tabelkroppe bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-tbody-wrap-test')
