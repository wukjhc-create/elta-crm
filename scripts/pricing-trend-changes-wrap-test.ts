/**
 * Ændringstallet på pristendenser ombrydes. Tallet er uændret.
 *   npx tsx scripts/pricing-trend-changes-wrap-test.ts
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
const expr = '{trend.change_count_30_days}'
const mobileAt = view.indexOf('data-testid="pricing-trend-changes-mobile"')
const mobile = mobileAt >= 0 ? view.slice(mobileAt - 80, mobileAt + 120) : ''
ok(mobile.includes('break-words min-w-0'), 'mobil ombrydes')
ok(mobile.includes(`· ${expr} ændringer`), 'mobil teksten er uændret')

const deskAt = view.indexOf('data-testid="pricing-trend-changes"')
const desk = deskAt >= 0 ? view.slice(deskAt - 120, deskAt + 80) : ''
ok(desk.includes('break-words min-w-0'), 'skrivebord ombrydes')
ok(desk.includes(expr), 'skrivebordstallet er uændret')
ok(view.includes('>Ændringer<'), 'kolonnen bliver')
ok(view.split(expr).length - 1 === 2, 'to tal')
ok(view.includes('{volatilityLabels[trend.volatility]}'), 'volatiliteten bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-changes-wrap-test')
