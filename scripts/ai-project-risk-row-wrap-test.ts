/**
 * Risikokortets raekke kan krympe. {risk.title} er uaendret.
 *   npx tsx scripts/ai-project-risk-row-wrap-test.ts
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
const id = 'data-testid="ai-project-risk-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="flex items-start gap-3 break-words min-w-0" data-testid="ai-project-risk-row"'
ok(row.includes('flex items-start gap-3 break-words min-w-0'), 'raekken kan krympe')
ok(row.includes('gap-3'), 'mellemrummet bliver')
ok(!row.includes('{risk.title}'), 'titlen er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-risks-list'), 'listen er et andet sted')
ok(!row.includes('ai-project-risk-buffer-label'), 'bufferen er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkeklassen findes en gang')
ok(!view.includes('className="flex items-start gap-3"'), 'den bare raekke er vaek')
ok(view.includes('className="font-medium break-words min-w-0" data-testid="ai-project-risk-title">{risk.title}</div>'), 'titlen bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')
ok(view.includes('data-testid="ai-project-risks-list"'), 'listen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-risk-row-wrap-test')
