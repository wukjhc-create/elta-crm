/**
 * Subtotalraekken i prisopbygningen kan krympe. Totalraekkerne og beloebet bliver.
 *   npx tsx scripts/ai-project-subtotal-row-wrap-test.ts
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
const id = 'data-testid="ai-project-subtotal-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 180) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 border-t pt-2 break-words" data-testid="ai-project-subtotal-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 border-t pt-2"'
ok(row.includes('<div'), 'det er subtotalraekken')
ok(row.includes('break-words'), 'subtotalraekken kan krympe')
ok(row.includes('>Subtotal</dt>'), 'etiketten ligger i raekken')
ok(row.includes('ai-project-subtotal-label'), 'subtotaletiketten ligger i raekken')
ok(!row.includes('formatCurrency'), 'beloebet er et andet sted')
ok(!row.includes('price.subtotal'), 'subtotalformlen er et andet sted')
ok(!row.includes('font-bold'), 'totalraekkerne er et andet sted')
ok(!row.includes('>Total</dt>'), 'totaletiketten er et andet sted')
ok(!row.includes('ai-project-price-total-row'), 'prisens totalraekke er en anden')
ok(!row.includes('ai-project-total-time-row'), 'tidens totalraekke er en anden')
ok(!row.includes('Materialer'), 'materialer er et andet sted')
ok(!row.includes('Margin'), 'margin er et andet sted')
ok(view.split(id).length === 2, 'subtotalraekken findes en gang')
ok(view.split(cell).length === 2, 'subtotalraekkens klasse findes en gang')
ok(view.split(bare).length === 1, 'ingen bar subtotalraekke')
ok(view.includes('break-words">{formatCurrency(result.calculation.price.subtotal)}'), 'subtotalen bliver')
ok(view.includes('data-testid="ai-project-price-total-row"'), 'prisens totalraekke bliver')
ok(view.includes('data-testid="ai-project-total-time-row"'), 'tidens totalraekke bliver')
ok(view.split('Subtotal').length === 2, 'teksten findes en gang')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-subtotal-row-wrap-test')
