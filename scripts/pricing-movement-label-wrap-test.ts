/**
 * Etiketten "Prisbevægelse" på prisstatistikken ombrydes. Procenterne er uændret.
 *   npx tsx scripts/pricing-movement-label-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-01-15').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-movement-label"')
const row = at >= 0 ? view.slice(at - 80, at + 640) : ''
ok(row.includes('break-words min-w-0'), 'etiketten ombrydes')
ok(row.includes('>Prisbevægelse<'), 'ordet er uændret')
ok(row.includes('+{stat.average_price_increase.toFixed(1)}%'), 'stigning er uændret')
ok(row.includes('-{stat.average_price_decrease.toFixed(1)}%'), 'fald er uændret')
ok(view.includes('data-testid="pricing-sync-date"'), 'synk-datoen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-movement-label-wrap-test')
