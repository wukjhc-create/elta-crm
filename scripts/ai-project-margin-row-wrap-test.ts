/**
 * Marginrækken i prisopbygningen kan krympe. De andre rækker og beløbet bliver.
 *   npx tsx scripts/ai-project-margin-row-wrap-test.ts
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
const id = 'data-testid="ai-project-margin-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 160) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-margin-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0"'
ok(row.includes('<div'), 'det er marginrækken')
ok(row.includes('flex flex-wrap justify-between gap-x-3 min-w-0 break-words'), 'rækken kan krympe')
ok(row.includes('>Margin'), 'etiketten ligger i rækken')
ok(row.includes('ai-project-margin-label'), 'marginetiketten ligger i rækken')
ok(!row.includes('margin_percentage'), 'marginprocenten er et andet sted')
ok(!row.includes('formatCurrency'), 'beløbet er et andet sted')
ok(!row.includes('margin_amount'), 'marginbeløbet er et andet sted')
ok(!row.includes('Subtotal'), 'subtotal er en anden række')
ok(!row.includes('Risikobuffer'), 'risikobuffer er en anden række')
ok(!row.includes('ai-project-labor-row'), 'arbejdslønrækken er et andet sted')
ok(!row.includes('ai-project-subtotal-row'), 'subtotalrækken er et andet sted')
ok(view.split(id).length === 2, 'marginrækken findes en gang')
ok(view.split(cell).length === 2, 'marginrækkens klasse findes en gang')
ok(view.split(bare).length === 7, 'de andre rækker bliver')
ok(view.includes('formatCurrency(result.calculation.price.margin_amount)'), 'marginbeløbet bliver')
ok(view.includes('{result.calculation.price.margin_percentage}%'), 'marginprocenten bliver')
ok(view.includes('<div className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-risk-buffer-row">\r\n                    <dt className="text-gray-500 break-words min-w-0" data-testid="ai-project-risk-buffer-label">'), 'risikobufferrækken kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-margin-row-wrap-test')
