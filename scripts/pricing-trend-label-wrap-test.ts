/**
 * Etiketterne 30 dage og 90 dage på pristendensernes mobilkort ombrydes.
 * Procentudtrykkene er uændret.
 *   npx tsx scripts/pricing-trend-label-wrap-test.ts
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
const pairs: Array<[string, string, string]> = [
  ['pricing-trend-label-30-mobile', '30 dage', "{trend.trend_30_days > 0 ? '+' : ''}{trend.trend_30_days}%"],
  ['pricing-trend-label-90-mobile', '90 dage', "{trend.trend_90_days > 0 ? '+' : ''}{trend.trend_90_days}%"],
]
for (const [id, word, expr] of pairs) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 80, at + 420) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes(word), `${id} ordet bliver`)
  ok(row.includes(expr), `${id} procenten er uændret`)
}
ok(view.includes('>30 dage<'), 'kolonnen 30 dage bliver')
ok(view.includes('>90 dage<'), 'kolonnen 90 dage bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-trend-label-wrap-test')
