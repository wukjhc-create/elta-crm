/**
 * "Kost pr. linje er skjult" ombrydes. Sætningen er uændret.
 *   npx tsx scripts/offer-vs-actual-closed-hint-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-offer-vs-actual-panel.tsx'), 'utf8')
const start = view.indexOf('data-testid="offer-vs-actual-closed-hint"')
const row = start >= 0 ? view.slice(start - 80, start + 120) : ''
ok(row.includes('break-words min-w-0'), 'linjen ombrydes')
ok(row.includes('>Kost pr. linje er skjult, indtil du åbner.</p>'), 'sætningen er uændret')
ok(!row.includes('truncate'), 'linjen klippes ikke')
ok(view.includes('data-testid="offer-vs-actual-error"'), 'fejlen er uændret')
ok(view.includes('data-testid="offer-vs-actual-loading"'), 'venteteksten er uændret')
ok(view.includes('profitabilityFigures(data.rows, [])'), 'linjetotalen bruger samme kostregel')
ok(view.includes('Den tælles ikke som 0 kr.'), 'brugt linje uden kost er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offer-vs-actual-closed-hint-wrap-test')
