/**
 * Skrivebordslinjens afvigelse ombrydes. moneyDev og "Kan ikke beregnes" er uændret.
 *   npx tsx scripts/aftercalc-desktop-line-dev-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = panel.indexOf('data-testid="aftercalc-line"')
const end = panel.indexOf('</tr>', start)
const row = start >= 0 && end > start ? panel.slice(start, end) : ''
ok(row.includes("break-words min-w-0\">{r.cost_deviation == null ? 'Kan ikke beregnes' : moneyDev(r.cost_deviation, false)}"), 'afvigelsen ombrydes')
ok(row.includes('break-words min-w-0">{kr(r.offered_cost)}'), 'kostcellen er uændret')
ok(row.includes('break-words min-w-0">{qty(r.offered_qty)}'), 'antalcellen er uændret')
ok(!row.includes('truncate'), 'afvigelsen klippes ikke')
ok(panel.includes('if (amount == null) return <span className="text-gray-400">Kan ikke beregnes</span>'), 'moneyDev er uændret')
ok(panel.includes('className="text-xs">Afvigelse {r.cost_deviation == null ? \'Kan ikke beregnes\' : moneyDev(r.cost_deviation, false)}'), 'mobil-afvigelsen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-desktop-line-dev-wrap-test')
