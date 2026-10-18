/**
 * Skrivebordslinjens antalceller ombrydes. qty() er uændret.
 *   npx tsx scripts/aftercalc-desktop-line-qty-wrap-test.ts
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
ok(row.includes('break-words min-w-0">{qty(r.offered_qty)}'), 'tilbudt antal ombrydes')
ok(row.includes('break-words min-w-0">{qty(r.actual_qty)}'), 'faktisk antal ombrydes')
ok(row.includes('break-words min-w-0">{kr(r.offered_cost)}'), 'kostcellen er uændret')
ok(!row.includes('truncate'), 'antallet klippes ikke')
ok(panel.includes("const qty = (n: number | null) => (n == null ? '—' : n.toLocaleString('da-DK', { maximumFractionDigits: 2 }))"), 'qty() er uændret')
ok(panel.includes('break-words min-w-0">Tilbudt antal {qty(r.offered_qty)}'), 'mobil-antallet er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-desktop-line-qty-wrap-test')
