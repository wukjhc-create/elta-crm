/**
 * Listen med identificerede risici kan krympe. Risikokortet er uaendret.
 *   npx tsx scripts/ai-project-risks-list-wrap-test.ts
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
const id = 'data-testid="ai-project-risks-list"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const cell = 'className="space-y-3 break-words min-w-0" data-testid="ai-project-risks-list"'
ok(row.includes('space-y-3 break-words min-w-0'), 'listen kan krympe')
ok(!row.includes('RiskCard'), 'risikokortet er et andet sted')
ok(!row.includes('Ingen væsentlige risici identificeret'), 'tomteksten er et andet sted')
ok(!row.includes('ai-project-no-risks'), 'tomraekken er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'listen findes en gang')
ok(view.split(cell).length === 2, 'listeklassen findes en gang')
ok(!view.includes('className="space-y-3"'), 'den bare liste er vaek')
ok(view.includes('<RiskCard key={i} risk={risk} />'), 'risikokortet bliver')
ok(view.includes('result.risks.length === 0'), 'tomlisten bliver')
ok(view.includes('Ingen væsentlige risici identificeret'), 'tomteksten bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-risks-list-wrap-test')
