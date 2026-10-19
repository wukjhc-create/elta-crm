/**
 * Mobilkortet for en komponent kan krympe. Priserne er uaendret.
 *   npx tsx scripts/ai-project-component-card-wrap-test.ts
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
const id = 'data-testid="ai-project-component-card"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
const cell = 'key={i} className="rounded-lg ring-1 ring-gray-200 p-3 text-sm break-words min-w-0"'
ok(row.includes('rounded-lg ring-1 ring-gray-200 p-3 text-sm break-words min-w-0'), 'kortet kan krympe')
ok(row.includes('key={i}'), 'noeglen bliver')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('{comp.name}'), 'navnet er et andet sted')
ok(view.split(id).length === 2, 'kortet findes en gang')
ok(view.split(cell).length === 2, 'kortklassen findes en gang')
ok(!view.includes('className="rounded-lg ring-1 ring-gray-200 p-3 text-sm min-w-0"'), 'den bare klasse er væk')
ok(view.includes('break-words font-medium text-gray-900">{comp.name}'), 'navnet bliver')
ok(view.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen bliver')
ok(view.includes('formatCurrency(comp.total)'), 'totalen bliver')
ok(view.includes('data-testid="ai-components-mobile"'), 'mobillisten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-component-card-wrap-test')
