/**
 * Tilbud-mod-faktisk fejltekst ombrydes. Nul-reglen er uændret.
 *   npx tsx scripts/offer-vs-actual-error-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-offer-vs-actual-panel.tsx'), 'utf8')
const start = view.indexOf('data-testid="offer-vs-actual-error"')
const row = start >= 0 ? view.slice(start - 40, start + 120) : ''
ok(row.includes('break-words min-w-0'), 'fejlen ombrydes')
ok(row.includes('{error}. Det tælles ikke som 0 kr.</p>'), 'sætningen er uændret')
ok(!row.includes('truncate'), 'fejlen klippes ikke')
ok(view.includes('Den tælles ikke som 0 kr.'), 'brugt linje uden kost er uændret')
ok(view.includes('min-h-[44px] px-3 text-sm font-medium border rounded-lg'), 'Prøv igen er høj nok')
ok(view.includes('data-testid="offer-vs-actual-loading"'), 'venteteksten er uændret')
ok(view.includes('profitabilityFigures(data.rows, [])'), 'linjetotalen bruger samme kostregel')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offer-vs-actual-error-wrap-test')
