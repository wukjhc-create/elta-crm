/**
 * Total-etiketten i prisopbygningen kan krympe. Beloebet bliver.
 *   npx tsx scripts/ai-project-price-total-label-wrap-test.ts
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
const id = 'data-testid="ai-project-price-total-label"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const cell = 'className="break-words min-w-0" data-testid="ai-project-price-total-label"'
ok(row.includes('<dt'), 'det er totaletiketten')
ok(row.includes('break-words min-w-0'), 'totaletiketten kan krympe')
ok(row.includes('>Total</dt>'), 'teksten bliver')
ok(!row.includes('formatCurrency'), 'beloebet er et andet sted')
ok(!row.includes('text-green-600'), 'beloebsfarven er et andet sted')
ok(!row.includes('>Total</th>'), 'totalkolonnen er en anden')
ok(!row.includes('ai-project-total-time-label'), 'totaltid er et andet sted')
ok(!row.includes('ai-project-total-col'), 'totalkolonnen er et andet sted')
ok(!row.includes('ai-project-total-hours'), 'timetallet er et andet sted')
ok(view.split(id).length === 2, 'totaletiketten findes en gang')
ok(view.split(cell).length === 2, 'totaletikettens klasse findes en gang')
ok(!view.includes('<dt>Total</dt>'), 'den bare etiket er vaek fra AI-projekt')
ok(view.includes('text-green-600 break-words">{formatCurrency(result.calculation.price.total_price)}'), 'totalprisen bliver')
ok(view.includes('data-testid="ai-project-total-col">Total</th>'), 'totalkolonnen bliver')
ok(view.split('>Total</th>').length === 2, 'kolonneteksten findes en gang')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-price-total-label-wrap-test')
