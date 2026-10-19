/**
 * Komponentnavnet paa skrivebord kan krympe. Navnet er uaendret.
 *   npx tsx scripts/ai-project-component-name-wrap-test.ts
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
const id = 'data-testid="ai-project-component-name"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const cell = 'className="p-3 break-words min-w-0"'
const mobile = 'break-words font-medium text-gray-900">{comp.name}'
ok(row.includes('p-3 break-words min-w-0'), 'navnet kan krympe')
ok(row.includes('{comp.name}'), 'navnet bliver i cellen')
ok(!row.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen er en anden')
ok(!row.includes('formatCurrency(comp.total)'), 'totalen er en anden')
ok(!row.includes('{comp.quantity}'), 'antallet er et andet')
ok(!row.includes('font-medium text-gray-900'), 'mobilkortet er et andet')
ok(view.split(id).length === 2, 'navnet findes en gang')
ok(view.split(cell).length === 2, 'celleklassen findes en gang')
ok(view.includes(mobile), 'mobilnavnet bliver')
ok(view.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen bliver')
ok(view.includes('formatCurrency(comp.total)'), 'totalen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-component-name-wrap-test')
