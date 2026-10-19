/**
 * Kundevaelgerens titelraekke kan krympe. Teksten Vaelg kunde er uaendret.
 *   npx tsx scripts/ai-project-customer-title-row-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-title-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const cell = 'className="flex items-center gap-2 min-w-0 break-words" data-testid="ai-project-customer-title-row"'
ok(row.includes('flex items-center gap-2 min-w-0 break-words'), 'raekken kan krympe')
ok(!row.includes('Vælg kunde'), 'teksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-customer-head'), 'hovedet er et andet sted')
ok(!row.includes('ai-project-customer-close'), 'luk er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkeklassen findes en gang')
ok(!view.includes('className="flex items-center gap-2 min-w-0"'), 'den bare raekke er vaek')
ok(view.split('>Vælg kunde<').length === 2, 'teksten findes en gang')
ok(view.includes('font-semibold break-words min-w-0">Vælg kunde'), 'overskriften bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-title-row-wrap-test')
