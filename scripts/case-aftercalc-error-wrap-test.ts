/**
 * Sagspanelets fejltekst ombrydes. Nul-reglen er uændret.
 *   npx tsx scripts/case-aftercalc-error-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = view.indexOf('data-testid="case-aftercalc-error"')
const row = start >= 0 ? view.slice(start - 40, start + 120) : ''
ok(row.includes('break-words min-w-0'), 'fejlen ombrydes')
ok(row.includes('{error}. Det tælles ikke som 0 kr.</p>'), 'sætningen er uændret')
ok(!row.includes('truncate'), 'fejlen klippes ikke')
ok(!view.includes('truncate'), 'panelet klipper ikke')
ok(view.includes('min-h-[44px] px-3 text-sm font-medium border rounded-lg'), 'Prøv igen er høj nok')
ok(view.includes('data-testid="case-aftercalc-loading"'), 'venteteksten er uændret')
ok(view.includes('Kan ikke beregnes'), 'ukendt beløb er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  case-aftercalc-error-wrap-test')
