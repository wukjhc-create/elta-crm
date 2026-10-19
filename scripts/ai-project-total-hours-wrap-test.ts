/**
 * Total tid i tidsberegningen kan krympe. Tallet er uaendret.
 *   npx tsx scripts/ai-project-total-hours-wrap-test.ts
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
const id = 'data-testid="ai-project-total-hours"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 120) : ''
const cell = 'className="min-w-0 break-words" data-testid="ai-project-total-hours"'
ok(row.includes('min-w-0 break-words'), 'totaltiden kan krympe')
ok(row.includes('<dd'), 'det er totaltiden')
ok(row.includes('total_hours.toFixed(1)'), 'tallet bliver i raekken')
ok(!row.includes('base_hours'), 'basistiden er et andet sted')
ok(!row.includes('accessibility_multiplier'), 'tilgaengeligheden er et andet sted')
ok(!row.includes('ai-project-total-time-label'), 'etiketten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('Math.round'), 'opsummeringens afrunding er et andet sted')
ok(view.split(id).length === 2, 'totaltiden findes en gang')
ok(view.split(cell).length === 2, 'totaltidsklassen findes en gang')
ok(!view.includes('<dd>{result.calculation.time.total_hours.toFixed(1)} timer</dd>'), 'den bare totaltid er vaek')
ok(view.includes('data-testid="ai-project-base-hours"'), 'basistiden bliver')
ok(view.includes('result.calculation.time.total_hours.toFixed(1)'), 'formlen bliver')
ok(view.split('>{title}<').length === 2, 'titelteksten findes en gang')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-total-hours-wrap-test')
