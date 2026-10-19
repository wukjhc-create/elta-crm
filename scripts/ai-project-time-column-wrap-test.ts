/**
 * Tidsberegningens kolonne kan krympe. Priskolonnen og timerne bliver.
 *   npx tsx scripts/ai-project-time-column-wrap-test.ts
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
const id = 'data-testid="ai-project-time-column"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 180) : ''
const cell = 'className="break-words min-w-0" data-testid="ai-project-time-column"'
ok(row.includes('<div'), 'det er tidskolonnen')
ok(row.includes('break-words min-w-0'), 'tidskolonnen kan krympe')
ok(row.includes('>Tidsberegning</h4>'), 'overskriften ligger i kolonnen')
ok(row.includes('ai-project-time-heading'), 'tidsoverskriften ligger i kolonnen')
ok(!row.includes('Prisopbygning'), 'priskolonnen er en anden')
ok(!row.includes('formatCurrency'), 'beloebene er et andet sted')
ok(!row.includes('<dl'), 'listen er et andet sted')
ok(!row.includes('ai-project-base-hours'), 'basistiden er et andet sted')
ok(!row.includes('ai-project-price-column'), 'priskolonnen er et andet sted')
ok(!row.includes('ai-project-total-hours'), 'totaltiden er et andet sted')
ok(view.split(id).length === 2, 'tidskolonnen findes en gang')
ok(view.split(cell).length === 2, 'tidskolonens klasse findes en gang')
ok(!view.includes('<div>\r\n                <h4 className="font-medium mb-3 break-words min-w-0" data-testid="ai-project-time-heading">'), 'den bare tidskolonne er vaek')
ok(view.includes('className="break-words min-w-0" data-testid="ai-project-price-column"'), 'priskolonnen bliver')
ok(view.includes('data-testid="ai-project-total-hours">{result.calculation.time.total_hours.toFixed(1)} timer'), 'totaltiden bliver')
ok(view.includes('data-testid="ai-project-base-hours">{result.calculation.time.base_hours.toFixed(1)} timer'), 'basistiden bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-time-column-wrap-test')
