/**
 * Den gamle pris på prisadvarslens mobilkort kan krympe. formatCurrency er uændret.
 *   npx tsx scripts/pricing-alert-old-mobile-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-old-mobile"')
const row = at >= 0 ? view.slice(at - 140, at + 80) : ''
ok(row.includes('text-xs tabular-nums text-gray-500 break-words min-w-0'), 'gammel pris kan krympe')
ok(row.includes('Gammel {formatCurrency(alert.old_price)}'), 'beløbet er uændret')
ok(view.includes('data-testid="pricing-alert-col-old"'), 'skrivebordskolonnen bliver')
ok(view.includes('text-right text-gray-500">{formatCurrency(alert.old_price)}'), 'skrivebordets pris bliver')
ok(view.includes('formatCurrency(alert.new_price)'), 'ny pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-old-mobile-wrap-test')
