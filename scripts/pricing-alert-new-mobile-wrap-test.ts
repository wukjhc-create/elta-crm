/**
 * Den nye pris på prisadvarslens mobilkort kan krympe. formatCurrency er uændret.
 *   npx tsx scripts/pricing-alert-new-mobile-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-new-mobile"')
const row = at >= 0 ? view.slice(at - 160, at + 80) : ''
ok(row.includes('text-xs tabular-nums font-medium text-gray-900 break-words min-w-0'), 'ny pris kan krympe')
ok(row.includes('Ny {formatCurrency(alert.new_price)}'), 'beløbet er uændret')
ok(view.includes('text-right font-medium">{formatCurrency(alert.new_price)}'), 'skrivebordets pris bliver')
ok(view.includes('data-testid="pricing-alert-old-mobile"'), 'gammel mobilpris bliver')
ok(view.includes('Gammel {formatCurrency(alert.old_price)}'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-new-mobile-wrap-test')
