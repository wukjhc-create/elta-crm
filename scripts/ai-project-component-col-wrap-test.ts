/**
 * Kolonnen Komponent kan krympe. Teksten er uaendret.
 *   npx tsx scripts/ai-project-component-col-wrap-test.ts
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
const id = 'data-testid="ai-project-component-col"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const cell = 'className="text-left p-3 break-words min-w-0"'
ok(row.includes('text-left p-3 break-words min-w-0'), 'kolonnen kan krympe')
ok(row.includes('>Komponent</th>'), 'teksten bliver i kolonnen')
ok(!row.includes('Komponenter'), 'overskriften er en anden')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('>Antal</th>'), 'antalkolonnen er en anden')
ok(view.split(id).length === 2, 'kolonnen findes en gang')
ok(view.split(cell).length === 2, 'kolonneklassen findes en gang')
ok(view.split('>Komponenter</h4>').length === 2, 'overskriften bliver')
ok(view.includes('text-right p-3">Antal</th>'), 'antalkolonnen bliver')
ok(view.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen bliver')
ok(view.includes('formatCurrency(comp.total)'), 'totalen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-component-col-wrap-test')
