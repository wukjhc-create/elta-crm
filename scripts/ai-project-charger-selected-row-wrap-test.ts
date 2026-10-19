/**
 * Raekken med valgt ladestander kan krympe. Prisen er uaendret.
 *   npx tsx scripts/ai-project-charger-selected-row-wrap-test.ts
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
const id = 'data-testid="ai-project-charger-selected-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
const cell = 'className="flex items-center justify-between gap-2 text-sm break-words min-w-0" data-testid="ai-project-charger-selected-row"'
ok(row.includes('flex items-center justify-between gap-2 text-sm break-words min-w-0'), 'raekken kan krympe')
ok(!row.includes('formatCurrency(charger.cost_price)'), 'kostprisen er et andet sted')
ok(!row.includes('{charger.name}'), 'navnet er et andet sted')
ok(!row.includes('ai-project-charger-selected"'), 'navnefeltet er et andet sted')
ok(!row.includes('Fjern'), 'fjern-knappen er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkeklassen findes en gang')
ok(!view.includes('className="flex items-center justify-between gap-2 text-sm"'), 'den bare raekke er vaek')
ok(view.includes('formatCurrency(charger.cost_price)'), 'kostprisen bliver')
ok(view.split('{charger.name}').length === 2, 'navnet findes en gang')
ok(view.includes('setCharger(null)'), 'fjern bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-charger-selected-row-wrap-test')
