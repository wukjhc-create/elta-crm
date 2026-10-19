/**
 * Arbejdslønrækken i prisopbygningen kan krympe. De andre rækker og beløbet bliver.
 *   npx tsx scripts/ai-project-labor-row-wrap-test.ts
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
const id = 'data-testid="ai-project-labor-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 120) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-labor-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0"'
ok(row.includes('<div'), 'det er arbejdslønrækken')
ok(row.includes('flex flex-wrap justify-between gap-x-3 min-w-0 break-words'), 'rækken kan krympe')
ok(row.includes('Arbejdsløn'), 'etiketten ligger i rækken')
ok(!row.includes('hourly_rate'), 'timelønnen er et andet sted')
ok(!row.includes('total_hours'), 'timetallet er et andet sted')
ok(!row.includes('formatCurrency'), 'beløbet er et andet sted')
ok(!row.includes('labor_cost'), 'lønbeløbet er et andet sted')
ok(!row.includes('Materialer'), 'materialer er en anden række')
ok(!row.includes('Subtotal'), 'subtotal er en anden række')
ok(!row.includes('Margin'), 'margin er en anden række')
ok(!row.includes('ai-project-materials-row'), 'materialerækken er et andet sted')
ok(view.split(id).length === 2, 'arbejdslønrækken findes en gang')
ok(view.split(cell).length === 2, 'arbejdslønrækkens klasse findes en gang')
ok(view.split(bare).length === 2, 'de andre rækker bliver')
ok(view.includes('formatCurrency(result.calculation.price.labor_cost)'), 'lønbeløbet bliver')
ok(view.includes('result.calculation.time.total_hours.toFixed(1)'), 'timetallet bliver')
ok(view.includes('result.calculation.price.hourly_rate'), 'timelønnen bliver')
ok(view.includes('<div className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-margin-row">\r\n                    <dt className="text-gray-500 break-words min-w-0" data-testid="ai-project-margin-label">'), 'marginrækken kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-labor-row-wrap-test')
