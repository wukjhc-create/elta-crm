/**
 * Bindestregen når en pristendens mangler ombrydes. Tegnet er uændret.
 *   npx tsx scripts/pricing-trend-missing-wrap-test.ts
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
for (const id of [
  'pricing-trend-30-missing-mobile',
  'pricing-trend-90-missing-mobile',
  'pricing-trend-30-missing',
  'pricing-trend-90-missing',
]) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 80, at + 90) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes('>-<'), `${id} tegnet er uændret`)
}
ok(view.includes('trend.trend_30_days !== null'), '30-dages tjek bliver')
ok(view.includes('trend.trend_90_days !== null'), '90-dages tjek bliver')
const affects = view.indexOf('alert.affects_offers === 0 && alert.affects_calculations === 0')
const affectsRow = affects >= 0 ? view.slice(affects, affects + 180) : ''
ok(affectsRow.includes('<span className="text-gray-400">-</span>'), 'påvirkningsstregen bliver')
ok(!affectsRow.includes('break-words'), 'påvirkningsstregen er ikke trendstregen')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-missing-wrap-test')
