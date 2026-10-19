/**
 * Prisbevægelsens gruppe på leverandørkortet ombrydes. Procenterne er uændrede.
 *   npx tsx scripts/pricing-movement-group-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-movement-group"')
const row = at >= 0 ? view.slice(at - 80, at + 520) : ''
ok(row.includes('min-w-0 break-words'), 'gruppen ombrydes')
ok(row.includes('data-testid="pricing-movement-increase"'), 'stigningsmaerket bliver')
ok(row.includes('data-testid="pricing-movement-decrease"'), 'faldsmaerket bliver')
ok(row.includes('+{stat.average_price_increase.toFixed(1)}%'), 'stigning er uændret')
ok(row.includes('-{stat.average_price_decrease.toFixed(1)}%'), 'fald er uændret')
ok(view.includes('>Prisbevægelse<'), 'ordet bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-movement-group-wrap-test')
