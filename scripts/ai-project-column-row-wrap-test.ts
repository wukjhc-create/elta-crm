/**
 * Kolonnerækken kan krympe. Datarækken og priserne er uaendret.
 *   npx tsx scripts/ai-project-column-row-wrap-test.ts
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
const id = 'data-testid="ai-project-column-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const cell = 'className="break-words min-w-0" data-testid="ai-project-column-row"'
ok(row.includes('break-words min-w-0'), 'kolonnerækken kan krympe')
ok(!row.includes('key={i}'), 'datarækken er en anden')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('{comp.name}'), 'navnet er et andet')
ok(!row.includes('Komponenter'), 'overskriften er en anden')
ok(!row.includes('<tr>'), 'den bare række er væk')
ok(view.split(id).length === 2, 'kolonnerækken findes en gang')
ok(view.split(cell).length === 2, 'række-klassen findes en gang')
ok(view.split('<tr>').length === 1, 'ingen bare kolonnerække')
ok(view.includes('key={i} className="break-words min-w-0"'), 'datarækken bliver')
ok(view.includes('data-testid="ai-project-component-col">Komponent'), 'komponentkolonnen bliver')
ok(view.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen bliver')
ok(view.includes('formatCurrency(comp.total)'), 'totalen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-column-row-wrap-test')
