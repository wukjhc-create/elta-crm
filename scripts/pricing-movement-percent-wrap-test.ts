/**
 * Procenterne ved "Prisbevægelse" ombrydes. toFixed-udtrykkene er uændret.
 *   npx tsx scripts/pricing-movement-percent-wrap-test.ts
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
const up = view.indexOf('data-testid="pricing-movement-increase"')
const down = view.indexOf('data-testid="pricing-movement-decrease"')
const upRow = up >= 0 ? view.slice(up - 80, up + 100) : ''
const downRow = down >= 0 ? view.slice(down - 80, down + 100) : ''
ok(upRow.includes('break-words min-w-0'), 'stigningen ombrydes')
ok(downRow.includes('break-words min-w-0'), 'faldet ombrydes')
ok(upRow.includes('>+{stat.average_price_increase.toFixed(1)}%<'), 'stigning er uændret')
ok(downRow.includes('>-{stat.average_price_decrease.toFixed(1)}%<'), 'fald er uændret')
ok(view.includes('>Prisbevægelse<'), 'ordet bliver')
ok(view.includes('Math.min(stat.average_price_increase * 5, 50)'), 'stigningsbjælken bliver')
ok(view.includes('Math.min(stat.average_price_decrease * 5, 50)'), 'faldsbjælken bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-movement-percent-wrap-test')
