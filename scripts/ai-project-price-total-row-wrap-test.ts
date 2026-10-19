/**
 * Totalraekken i prisopbygningen kan krympe. Tidsberegningens totalraekke og beloebet bliver.
 *   npx tsx scripts/ai-project-price-total-row-wrap-test.ts
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
const id = 'data-testid="ai-project-price-total-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 160) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 border-t pt-2 font-bold break-words" data-testid="ai-project-price-total-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 border-t pt-2 font-bold"'
ok(row.includes('<div'), 'det er totalraekken')
ok(row.includes('break-words'), 'totalraekken kan krympe')
ok(row.includes('font-bold'), 'raekken er stadig fremhaevet')
ok(row.includes('>Total</dt>'), 'etiketten ligger i raekken')
ok(row.includes('ai-project-price-total-label'), 'totaletiketten ligger i raekken')
ok(!row.includes('formatCurrency'), 'beloebet er et andet sted')
ok(!row.includes('text-green-600'), 'beloebsfarven er et andet sted')
ok(!row.includes('Total tid'), 'totaltid er et andet sted')
ok(!row.includes('ai-project-total-time-label'), 'totaltidsetiketten er et andet sted')
ok(!row.includes('ai-project-total-hours'), 'timetallet er et andet sted')
ok(!row.includes('Subtotal'), 'subtotal er et andet sted')
ok(!row.includes('>Total</th>'), 'totalkolonnen er en anden')
ok(view.split(id).length === 2, 'totalraekken findes en gang')
ok(view.split(cell).length === 2, 'totalraekkens klasse findes en gang')
ok(view.split(bare).length === 2, 'tidsberegningens totalraekke bliver bar')
ok(view.includes('text-green-600 break-words">{formatCurrency(result.calculation.price.total_price)}'), 'totalprisen bliver')
ok(view.includes('data-testid="ai-project-total-time-label">Total tid</dt>'), 'totaltidsetiketten bliver')
ok(view.includes('data-testid="ai-project-total-hours">{result.calculation.time.total_hours.toFixed(1)} timer'), 'totaltiden bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-price-total-row-wrap-test')
