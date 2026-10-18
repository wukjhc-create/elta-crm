/**
 * Skrivebordslinjens kostceller ombrydes. kr() og qty() er uændret.
 *   npx tsx scripts/aftercalc-desktop-line-cost-wrap-test.ts
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
ok(row.includes('data-testid="aftercalc-line"'), 'linjerækken kan findes')
ok(row.includes('break-words min-w-0">{kr(r.offered_cost)}'), 'tilbudt kost ombrydes')
ok(row.includes('break-words min-w-0">{kr(r.actual_cost)}'), 'faktisk kost ombrydes')
ok(row.includes('>{qty(r.offered_qty)}') && row.includes('>{qty(r.actual_qty)}'), 'antalcellerne er uændret')
ok(!row.includes('truncate'), 'kosten klippes ikke')
ok(panel.includes("const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))"), 'kr() er uændret')
ok(panel.includes("const qty = (n: number | null) => (n == null ? '—' : n.toLocaleString('da-DK', { maximumFractionDigits: 2 }))"), 'qty() er uændret')
ok(panel.includes('break-words min-w-0">Tilbudt kost {kr(r.offered_cost)}'), 'mobil-kosten er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-desktop-line-cost-wrap-test')
