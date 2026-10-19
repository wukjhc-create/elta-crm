/**
 * Risikobufferrækken i prisopbygningen kan krympe. De andre rækker og beløbet bliver.
 *   npx tsx scripts/ai-project-risk-buffer-row-wrap-test.ts
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
const id = 'data-testid="ai-project-risk-buffer-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 170) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-risk-buffer-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0"'
ok(row.includes('<div'), 'det er risikobufferrækken')
ok(row.includes('flex flex-wrap justify-between gap-x-3 min-w-0 break-words'), 'rækken kan krympe')
ok(row.includes('>Risikobuffer'), 'etiketten ligger i rækken')
ok(row.includes('ai-project-risk-buffer-label'), 'bufferetiketten ligger i rækken')
ok(!row.includes('formatCurrency'), 'beløbet er et andet sted')
ok(!row.includes('risk_buffer_percentage'), 'bufferprocenten er et andet sted')
ok(!row.includes('risk_buffer_amount'), 'bufferbeløbet er et andet sted')
ok(!row.includes('Margin'), 'margin er en anden række')
ok(!row.includes('ai-project-margin-row'), 'marginrækken er et andet sted')
ok(!row.includes('Subtotal'), 'subtotal er en anden række')
ok(view.split(id).length === 2, 'risikobufferrækken findes en gang')
ok(view.split(cell).length === 2, 'risikobufferrækkens klasse findes en gang')
ok(view.split(bare).length === 1, 'de andre rækker bliver')
ok(view.includes('formatCurrency(result.calculation.price.risk_buffer_amount)'), 'bufferbeløbet bliver')
ok(view.includes('{result.calculation.price.risk_buffer_percentage}%'), 'bufferprocenten bliver')
ok(view.includes('<div className="flex flex-wrap justify-between gap-x-3 min-w-0 border-t pt-2 font-bold break-words" data-testid="ai-project-price-total-row">'), 'totalrækken bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-risk-buffer-row-wrap-test')
