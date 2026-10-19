/**
 * Antal og enhed paa skrivebord kan krympe. Udtrykket er uaendret.
 *   npx tsx scripts/ai-project-component-qty-wrap-test.ts
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
const id = 'data-testid="ai-project-component-qty"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const cell = 'className="p-3 text-right break-words min-w-0"'
const expr = '{comp.quantity} {comp.unit}'
ok(row.includes('p-3 text-right break-words min-w-0'), 'antallet kan krympe')
ok(row.includes(expr), 'antallet bliver i cellen')
ok(!row.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen er en anden')
ok(!row.includes('formatCurrency(comp.total)'), 'totalen er en anden')
ok(!row.includes('ai-project-component-name'), 'navnet er et andet')
ok(view.split(id).length === 2, 'antallet findes en gang')
ok(view.split(cell).length === 2, 'celleklassen findes en gang')
ok(view.includes(expr + ' ·'), 'mobilantallet bliver')
ok(view.includes('className="p-3 text-right">{formatCurrency(comp.unit_price)}'), 'enhedspriscellen bliver')
ok(view.includes('className="p-3 text-right font-medium">{formatCurrency(comp.total)}'), 'totalcellen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-component-qty-wrap-test')
