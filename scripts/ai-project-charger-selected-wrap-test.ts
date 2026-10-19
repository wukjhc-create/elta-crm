/**
 * Den valgte ladestanders navn ombrydes. Kostprisen er uaendret.
 *   npx tsx scripts/ai-project-charger-selected-wrap-test.ts
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
const id = 'data-testid="ai-project-charger-selected"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 200) : ''
ok(row.includes('break-words min-w-0'), 'navnet ombrydes')
ok(row.includes('{charger.name}'), 'navnet bliver')
ok(row.includes('formatCurrency(charger.cost_price)'), 'kostprisen er uaendret')
ok(view.split('{charger.name}').length === 2, 'navnet findes en gang')
ok(view.includes('setCharger(null)'), 'fjern bliver')
ok(view.includes('data-testid="ai-project-charger-unpriced"'), 'hjaelpeteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-charger-selected-wrap-test')
