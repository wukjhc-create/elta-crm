/**
 * Påvirkningscellen på prisadvarslens skrivebord ombrydes. Tællerne er uændrede.
 *   npx tsx scripts/pricing-alert-affects-cell-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-affects-cell"')
const row = at >= 0 ? view.slice(at - 40, at + 1100) : ''
ok(row.includes('break-words min-w-0'), 'cellen ombrydes')
ok(row.includes('{alert.affects_offers}'), 'tilbudstallet er uændret')
ok(row.includes('{alert.affects_calculations}'), 'kalkulationstallet er uændret')
ok(row.includes('alert.affects_offers > 0'), 'tilbuds-betingelsen bliver')
ok(row.includes('alert.affects_calculations > 0'), 'kalkule-betingelsen bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(view.includes('formatCurrency(alert.new_price)'), 'ny pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-affects-cell-wrap-test')
