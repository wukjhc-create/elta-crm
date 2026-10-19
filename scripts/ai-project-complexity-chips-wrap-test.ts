/**
 * Kompleksitetsfaktorernes chip-raekke kan krympe. Overskriften er uaendret.
 *   npx tsx scripts/ai-project-complexity-chips-wrap-test.ts
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
const id = 'data-testid="ai-project-complexity-chips"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="flex flex-wrap gap-2 break-words min-w-0" data-testid="ai-project-complexity-chips"'
ok(row.includes('flex flex-wrap gap-2 break-words min-w-0'), 'raekken kan krympe')
ok(row.includes('gap-2'), 'mellemrummet bliver')
ok(!row.includes('Kompleksitetsfaktorer'), 'overskriften er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-complexity-heading'), 'overskriftsid er et andet sted')
ok(!row.includes('ai-project-complexity-frame'), 'rammen er et andet sted')
ok(!row.includes('{f.name}'), 'faktoren er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkeklassen findes en gang')
ok(!view.includes('className="flex flex-wrap gap-2"'), 'den bare raekke er vaek')
ok(view.split('>Kompleksitetsfaktorer</h4>').length === 2, 'overskriften findes en gang')
ok(view.includes('{f.name} (×{f.multiplier})'), 'faktoren bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-complexity-chips-wrap-test')
