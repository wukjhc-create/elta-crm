/**
 * Tidsberegningens liste kan krympe. De tre andre lister med samme klasse bliver.
 *   npx tsx scripts/ai-project-time-list-wrap-test.ts
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
const id = 'data-testid="ai-project-time-list"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 40) : ''
const cell = 'className="space-y-2 text-sm break-words min-w-0" data-testid="ai-project-time-list"'
ok(row.includes('<dl'), 'det er tidsberegningens liste')
ok(row.includes('space-y-2 text-sm break-words min-w-0'), 'listen kan krympe')
ok(row.includes('>Tidsberegning</h4>'), 'overskriften ligger over listen')
ok(row.includes('ai-project-time-heading'), 'tidsberegningen ligger over listen')
ok(!row.includes('Prisopbygning'), 'prislisten er en anden')
ok(!row.includes('Bygningsinformation'), 'bygningslisten er en anden')
ok(!row.includes('Elpunkter'), 'elpunktlisten er en anden')
ok(!row.includes('ai-project-base-hours'), 'basistiden er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('base_hours'), 'basistallets formel er et andet sted')
ok(view.split(id).length === 2, 'listen findes en gang')
ok(view.split(cell).length === 2, 'listens klasse findes en gang')
ok(view.split('className="space-y-2 text-sm"').length === 4, 'tre andre lister bliver')
ok(view.includes('result.calculation.time.base_hours.toFixed(1)'), 'basistiden bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')
ok(view.includes('data-testid="ai-project-price-total-label">Total</dt>'), 'totaletiketten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-time-list-wrap-test')
