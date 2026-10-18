/**
 * Volatilitetsmærket Stabil, Moderat og Høj ombrydes. Ordene er uændret.
 *   npx tsx scripts/pricing-volatility-wrap-test.ts
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
const expr = '{volatilityLabels[trend.volatility]}'
for (const id of ['pricing-volatility-mobile', 'pricing-volatility']) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 180, at + 160) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes(expr), `${id} udtrykket er uændret`)
}
ok(view.includes("stable: 'Stabil'"), 'Stabil bliver')
ok(view.includes("moderate: 'Moderat'"), 'Moderat bliver')
ok(view.includes("high: 'Høj'"), 'Høj bliver')
ok(view.includes("stable: 'bg-green-100 text-green-700'"), 'grøn bliver')
ok(view.includes("moderate: 'bg-amber-100 text-amber-700'"), 'gul bliver')
ok(view.includes("high: 'bg-red-100 text-red-700'"), 'rød bliver')
ok(view.split(expr).length - 1 === 2, 'to visninger')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-volatility-wrap-test')
