/**
 * Mobil-linjens afvigelse ombrydes. "Kan ikke beregnes" og moneyDev er uændret.
 *   npx tsx scripts/aftercalc-mobile-line-dev-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = panel.indexOf('data-testid="aftercalc-lines-mobile"')
const end = panel.indexOf('hidden md:block', start)
const mobile = start >= 0 && end > start ? panel.slice(start, end) : ''
ok(mobile.includes("break-words min-w-0\">Afvigelse {r.cost_deviation == null ? 'Kan ikke beregnes' : moneyDev(r.cost_deviation, false)}"), 'afvigelsen ombrydes')
ok(mobile.includes("r.cost_deviation == null ? 'Kan ikke beregnes'"), 'ukendt afvigelse er uændret')
ok(!mobile.includes('truncate'), 'afvigelsen klippes ikke')
ok(panel.includes('if (amount == null) return <span className="text-gray-400">Kan ikke beregnes</span>'), 'moneyDev er uændret')
ok(panel.includes("break-words min-w-0\">{r.cost_deviation == null ? 'Kan ikke beregnes' : moneyDev(r.cost_deviation, false)}"), 'skrivebordet er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-mobile-line-dev-wrap-test')
