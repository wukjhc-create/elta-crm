/**
 * AI-projektets resultatstak kan krympe. Priserne er uaendret.
 *   npx tsx scripts/ai-project-results-wrap-test.ts
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
const id = 'data-testid="ai-project-results"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const cell = 'className="space-y-6 break-words min-w-0" data-testid="ai-project-results"'
ok(row.includes('space-y-6 break-words min-w-0'), 'stakken kan krympe')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('total_price'), 'totalprisen er et andet sted')
ok(!row.includes('ai-project-warnings-box'), 'boksen er et andet sted')
ok(view.split(id).length === 2, 'stakken findes en gang')
ok(view.split(cell).length === 2, 'stakklassen findes en gang')
ok(!view.includes('className="space-y-6"'), 'den bare stak er væk')
ok(view.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen bliver')
ok(view.includes('formatCurrency(comp.total)'), 'komponenttotalen bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-results-wrap-test')
