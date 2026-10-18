/**
 * Procentmærket på prisadvarslerne ombrydes. toFixed-udtrykket er uændret.
 *   npx tsx scripts/pricing-alert-change-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const expr = "{isIncrease ? '+' : ''}{alert.change_percentage.toFixed(1)}%"
const ids = ['pricing-alert-change-mobile', 'pricing-alert-change']
for (const id of ids) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 40, at + 120) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes(expr), `${id} udtrykket er uændret`)
}
ok((view.match(/alert\.change_percentage\.toFixed\(1\)/g) || []).length === 2, 'begge procenter bliver')
ok(view.includes("severity === 'critical' ? 'bg-red-100 text-red-700'"), 'farven bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-change-wrap-test')
