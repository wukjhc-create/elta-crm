/**
 * Alvorligheds-mærket på prisadvarslens mobilkort ombrydes. Procenten er uændret.
 *   npx tsx scripts/pricing-alert-severity-mobile-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-alert-severity-mobile"')
const row = at >= 0 ? view.slice(at - 450, at + 360) : ''
ok(row.includes('break-words min-w-0 inline-flex'), 'maerket ombrydes')
ok(row.includes("severity === 'critical' ? 'bg-red-100 text-red-700'"), 'farven er uændret')
ok(row.includes("{isIncrease ? '+' : ''}{alert.change_percentage.toFixed(1)}%"), 'procenten er uændret')
ok(row.includes('data-testid="pricing-alert-change-mobile"'), 'procent-maerket bliver')
ok(view.includes('data-testid="pricing-alert-severity"'), 'skrivebordet bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(view.includes('formatCurrency(alert.new_price)'), 'ny pris bliver')
ok((view.match(/alert\.change_percentage\.toFixed\(1\)/g) || []).length === 2, 'begge procenter bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-severity-mobile-wrap-test')
