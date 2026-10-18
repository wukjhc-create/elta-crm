/**
 * Mobil-linjens kost ombrydes. Kosttallet er uændret.
 *   npx tsx scripts/aftercalc-line-cost-wrap-test.ts
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
ok(mobile.includes('break-words min-w-0">Tilbudt kost {kr(r.offered_cost)} · faktisk kost {kr(r.actual_cost)}'), 'kosten ombrydes')
ok(mobile.includes('r.offered_cost') && mobile.includes('r.actual_cost'), 'begge kostsider bliver')
ok(mobile.includes("r.cost_deviation == null ? 'Kan ikke beregnes'"), 'ukendt afvigelse er uændret')
ok(panel.includes("const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))"), 'kr() er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-line-cost-wrap-test')
