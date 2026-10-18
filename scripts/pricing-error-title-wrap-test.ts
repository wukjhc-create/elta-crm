/**
 * Fejloverskriften på prissætning ombrydes. Sætningen og reset er uændret.
 *   npx tsx scripts/pricing-error-title-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'error.tsx'), 'utf8')
const sentence = 'Kunne ikke indlæse prissætning'
const at = view.indexOf('data-testid="pricing-error-title"')
const row = at >= 0 ? view.slice(at - 120, at + 120) : ''
ok(row.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(row.includes(sentence), 'sætningen er uændret')
ok(view.includes('onClick={reset}'), 'reset bliver')
ok(view.includes('Der opstod en fejl. Prøv at genindlæse siden.'), 'fejlteksten bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-error-title-wrap-test')
