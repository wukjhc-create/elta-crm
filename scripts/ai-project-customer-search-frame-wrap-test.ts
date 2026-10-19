/**
 * Soegefeltets ramme i kundevaelgeren kan krympe. Soegefeltet er uaendret.
 *   npx tsx scripts/ai-project-customer-search-frame-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-search-frame"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const cell = 'className="relative mb-4 break-words min-w-0" data-testid="ai-project-customer-search-frame"'
ok(row.includes('relative mb-4 break-words min-w-0'), 'rammen kan krympe')
ok(!row.includes('placeholder="Søg efter kunde..."'), 'pladsholderen er et andet sted')
ok(!row.includes('aria-label="Søg efter kunde"'), 'aria-label er et andet sted')
ok(!row.includes('value={customerSearch}'), 'vaerdien er et andet sted')
ok(!row.includes('ai-project-customer-search"'), 'soegefeltet er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(cell).length === 2, 'rammeklassen findes en gang')
ok(!view.includes('className="relative mb-4"'), 'den bare ramme er vaek')
ok(view.includes('data-testid="ai-project-customer-search"'), 'soegefeltet bliver')
ok(view.includes('placeholder="Søg efter kunde..."'), 'pladsholderen bliver')
ok(view.includes('aria-label="Søg efter kunde"'), 'aria-label bliver')
ok(view.includes('value={customerSearch}'), 'vaerdien bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-search-frame-wrap-test')
