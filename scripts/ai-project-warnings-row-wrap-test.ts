/**
 * AI-projektets bemaerkningsraekke kan krympe. Advarselsteksten er uaendret.
 *   npx tsx scripts/ai-project-warnings-row-wrap-test.ts
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
const id = 'data-testid="ai-project-warnings-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const cell = 'className="flex items-start gap-2 break-words min-w-0" data-testid="ai-project-warnings-row"'
ok(row.includes('flex items-start gap-2 break-words min-w-0'), 'raekken kan krympe')
ok(!row.includes('{w}'), 'advarselsteksten er et andet sted')
ok(!row.includes('Bemærkninger'), 'overskriften er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-warnings-heading'), 'overskriftsid er et andet sted')
ok(!row.includes('ai-project-warnings-box'), 'boksen er et andet sted')
ok(!row.includes('ai-project-warnings-list'), 'listen er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkeklassen findes en gang')
ok(!view.includes('className="flex items-start gap-2"'), 'den bare raekke er vaek')
ok(view.includes('<li key={i}>• {w}</li>'), 'advarslen bliver')
ok(view.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen bliver')
ok(view.includes('formatCurrency(comp.total)'), 'komponenttotalen bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-warnings-row-wrap-test')
