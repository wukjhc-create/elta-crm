/**
 * Komponenttabellens krop kan krympe. Priserne er uaendret.
 *   npx tsx scripts/ai-project-components-body-wrap-test.ts
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
const id = 'data-testid="ai-project-components-body"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const cell = 'className="divide-y break-words min-w-0" data-testid="ai-project-components-body"'
ok(row.includes('divide-y break-words min-w-0'), 'kroppen kan krympe')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('{comp.name}'), 'navnet er et andet')
ok(!row.includes('ai-project-components-head'), 'hovedet er et andet')
ok(!row.includes('ai-project-component-row'), 'datarækken er en anden')
ok(view.split(id).length === 2, 'kroppen findes en gang')
ok(view.split(cell).length === 2, 'kropklassen findes en gang')
ok(!view.includes('<tbody className="divide-y">'), 'den bare krop er væk')
ok(view.includes('data-testid="ai-project-component-row"'), 'datarækken bliver')
ok(view.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen bliver')
ok(view.includes('formatCurrency(comp.total)'), 'totalen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-components-body-wrap-test')
