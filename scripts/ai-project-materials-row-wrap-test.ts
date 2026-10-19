/**
 * Materialerækken i prisopbygningen kan krympe. De andre rækker og beløbet bliver.
 *   npx tsx scripts/ai-project-materials-row-wrap-test.ts
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
const id = 'data-testid="ai-project-materials-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 200) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-materials-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0"'
ok(row.includes('<div'), 'det er materialerækken')
ok(row.includes('flex flex-wrap justify-between gap-x-3 min-w-0 break-words'), 'rækken kan krympe')
ok(row.includes('>Materialer<'), 'etiketten ligger i rækken')
ok(row.includes('ai-project-materials-label'), 'materialetiketten ligger i rækken')
ok(!row.includes('formatCurrency'), 'beløbet er et andet sted')
ok(!row.includes('Arbejdsløn'), 'arbejdslønnen er en anden række')
ok(!row.includes('Margin'), 'margin er en anden række')
ok(!row.includes('Subtotal'), 'subtotal er en anden række')
ok(!row.includes('material_cost'), 'materialeprisen er et andet sted')
ok(!row.includes('ai-project-price-list'), 'prislisten er et andet sted')
ok(view.split(id).length === 2, 'materialerækken findes en gang')
ok(view.split(cell).length === 2, 'materialerækkens klasse findes en gang')
ok(view.split(bare).length === 4, 'de andre rækker bliver')
ok(view.includes('break-words">{formatCurrency(result.calculation.price.material_cost)}'), 'materialeprisen bliver')
ok(view.includes('<div className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-labor-row">\r\n                    <dt className="text-gray-500 min-w-0 break-words">Arbejdsløn ({result.calculation.time.total_hours.toFixed(1)}t × {result.calculation.price.hourly_rate} kr)</dt>'), 'arbejdslønrækken kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-materials-row-wrap-test')
