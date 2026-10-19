/**
 * Prisopbygningens liste kan krympe. Bygningslisten, elpunktlisten og tidslisten bliver.
 *   npx tsx scripts/ai-project-price-list-wrap-test.ts
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
const id = 'data-testid="ai-project-price-list"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 40) : ''
const cell = 'className="space-y-2 text-sm break-words min-w-0" data-testid="ai-project-price-list"'
const bare = 'className="space-y-2 text-sm"'
ok(row.includes('<dl'), 'det er prislisten')
ok(row.includes('space-y-2 text-sm break-words min-w-0'), 'listen kan krympe')
ok(row.includes('>Prisopbygning</h4>'), 'overskriften ligger over listen')
ok(row.includes('ai-project-price-heading'), 'prisoverksriften ligger over listen')
ok(!row.includes('Bygningsinformation'), 'bygningslisten er en anden')
ok(!row.includes('Elpunkter'), 'elpunktlisten er en anden')
ok(!row.includes('Tidsberegning'), 'tidslisten er en anden')
ok(!row.includes('formatCurrency'), 'beloebene er et andet sted')
ok(!row.includes('Materialer'), 'materialer er et andet sted')
ok(!row.includes('ai-project-materials-label'), 'materialetiketten er et andet sted')
ok(!row.includes('ai-project-price-column'), 'priskolonnen er et andet sted')
ok(!row.includes('ai-project-time-list'), 'tidslisten er et andet sted')
ok(!row.includes('ai-project-points-list'), 'elpunktlisten er et andet sted')
ok(!row.includes('ai-project-building-list'), 'bygningslisten er et andet sted')
ok(view.split(id).length === 2, 'prislisten findes en gang')
ok(view.split(cell).length === 2, 'prislistens klasse findes en gang')
ok(view.split(bare).length === 1, 'ingen bar liste bliver')
ok(view.includes('className="space-y-2 text-sm break-words min-w-0" data-testid="ai-project-building-list"'), 'bygningslisten bliver')
ok(view.includes('className="space-y-2 text-sm break-words min-w-0" data-testid="ai-project-points-list"'), 'elpunktlisten bliver')
ok(view.includes('className="space-y-2 text-sm break-words min-w-0" data-testid="ai-project-time-list"'), 'tidslisten bliver')
ok(view.includes('break-words">{formatCurrency(result.calculation.price.material_cost)}'), 'materialeprisen bliver')
ok(view.includes('text-green-600 break-words">{formatCurrency(result.calculation.price.total_price)}'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-price-list-wrap-test')
