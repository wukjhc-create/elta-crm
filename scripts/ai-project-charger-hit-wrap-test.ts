/**
 * Soegeresultatets ladestander kan krympe. Kostudtrykket er uaendret.
 *   npx tsx scripts/ai-project-charger-hit-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const view = readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
const id = 'data-testid="ai-project-charger-hit"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 240) : ''
const expr = 'formatCurrency(h.cost_price)'
ok(row.includes('break-words min-w-0'), 'resultatet kan krympe')
ok(row.includes(expr), 'kostudtrykket er uaendret')
ok(row.includes('setCharger(h)'), 'valget bliver')
ok(row.includes('setChargerHits([])'), 'listen ryddes')
ok(view.split(expr).length === 2, 'kostudtrykket findes en gang')
ok(view.includes('data-testid="charger-search-error"'), 'fejlteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-charger-hit-wrap-test')
