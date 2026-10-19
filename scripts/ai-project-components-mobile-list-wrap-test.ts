/**
 * Mobillisten af komponenter kan krympe. Priserne er uaendret.
 *   npx tsx scripts/ai-project-components-mobile-list-wrap-test.ts
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
const id = 'data-testid="ai-components-mobile"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const cell = 'className="md:hidden space-y-2 break-words min-w-0" data-testid="ai-components-mobile"'
ok(row.includes('md:hidden space-y-2 break-words min-w-0'), 'mobillisten kan krympe')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('{comp.name}'), 'navnet er et andet sted')
ok(!row.includes('hidden md:block'), 'skrivebordet er et andet')
ok(view.split(id).length === 2, 'mobillisten findes en gang')
ok(view.split(cell).length === 2, 'listeklassen findes en gang')
ok(view.includes('break-words font-medium text-gray-900">{comp.name}'), 'navnet bliver')
ok(view.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen bliver')
ok(view.includes('formatCurrency(comp.total)'), 'totalen bliver')
ok(view.includes('hidden md:block border rounded-lg overflow-hidden'), 'skrivebordet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-components-mobile-list-wrap-test')
