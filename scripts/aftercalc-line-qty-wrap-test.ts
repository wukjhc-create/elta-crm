/**
 * Mobil-linjen ombryder tilbudt og faktisk antal. qty() er uændret.
 *   npx tsx scripts/aftercalc-line-qty-wrap-test.ts
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
ok(mobile.includes('break-words min-w-0">Tilbudt antal {qty(r.offered_qty)} · faktisk antal {qty(r.actual_qty)}'), 'antallene ombrydes')
ok(mobile.includes('qty(r.offered_qty)') && mobile.includes('qty(r.actual_qty)'), 'begge antal bruges')
ok(!mobile.includes('truncate'), 'antallene klippes ikke')
ok(panel.includes("const qty = (n: number | null) => (n == null ? '—' : n.toLocaleString('da-DK', { maximumFractionDigits: 2 }))"), 'qty() er uændret')
ok(panel.includes('text-xs text-gray-700 break-words min-w-0">Tilbudt kost {kr(r.offered_cost)}'), 'kostlinjen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-line-qty-wrap-test')
