/**
 * Skrivebords-resuméet ombryder tilbudt, faktisk og afvigelse. Tallene er uændret.
 *   npx tsx scripts/aftercalc-desktop-summary-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = panel.indexOf('data-testid="aftercalc-row"')
const end = panel.indexOf('</tr>', start)
const row = start >= 0 && end > start ? panel.slice(start, end) : ''
ok(row.includes('data-testid="aftercalc-row"'), 'resumé-rækken kan findes')
ok(row.includes('break-words min-w-0">{r.quoted}'), 'tilbudt ombrydes')
ok(row.includes('break-words min-w-0">{r.actual}'), 'faktisk ombrydes')
ok(row.includes('break-words min-w-0"><DevCell value={r.variance} kind={r.kind} />'), 'afvigelse ombrydes')
ok(!row.includes('truncate'), 'tallene klippes ikke')
ok(panel.includes('break-words min-w-0">Tilbudt {r.quoted}'), 'mobil-resuméet er uændret')
ok(panel.includes("const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))"), 'kr() er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-desktop-summary-wrap-test')
