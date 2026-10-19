/**
 * Enhedsprisen paa skrivebord kan krympe. Prisudtrykket er uaendret.
 *   npx tsx scripts/ai-project-component-unit-wrap-test.ts
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
const id = 'data-testid="ai-project-component-unit"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const cell = 'className="p-3 text-right break-words min-w-0"'
const expr = 'formatCurrency(comp.unit_price)'
ok(row.includes('p-3 text-right break-words min-w-0'), 'enhedsprisen kan krympe')
ok(row.includes(expr), 'enhedsprisen bliver i cellen')
ok(!row.includes('formatCurrency(comp.total)'), 'totalen er en anden')
ok(!row.includes('{comp.quantity}'), 'antallet er et andet')
ok(view.split(id).length === 2, 'enhedsprisen findes en gang')
ok(view.split(cell).length === 3, 'celleklassen findes to gange')
ok(view.includes('{comp.quantity} {comp.unit} · {' + expr + '}'), 'mobilprisen bliver')
ok(view.includes('className="p-3 text-right font-medium">{formatCurrency(comp.total)}'), 'totalcellen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-component-unit-wrap-test')
