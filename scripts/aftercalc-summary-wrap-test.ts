/**
 * Mobil-resuméet på sagspanelet ombryder beløb. Tallene er uændret.
 *   npx tsx scripts/aftercalc-summary-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = panel.indexOf('data-testid="aftercalc-summary-mobile"')
const end = panel.indexOf('hidden md:block', start)
const summary = start >= 0 && end > start ? panel.slice(start, end) : ''
ok(summary.includes('break-words min-w-0">Tilbudt {r.quoted}'), 'tilbudt ombrydes')
ok(summary.includes('break-words min-w-0">Faktisk {r.actual}'), 'faktisk ombrydes')
ok(summary.includes('break-words min-w-0">Afvigelse <DevCell value={r.variance} kind={r.kind} />'), 'afvigelse ombrydes')
ok(panel.includes('data-testid="aftercalc-row"'), 'bordet beholder rækken')
ok(panel.includes("const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, 'DKK', 0))"), 'kr() er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-summary-wrap-test')
