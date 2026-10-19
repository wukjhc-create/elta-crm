/**
 * Kompleksitetsfaktorrækken i tidsberegningen kan krympe. De andre rækker og faktoren bliver.
 *   npx tsx scripts/ai-project-time-complexity-row-wrap-test.ts
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
const id = 'data-testid="ai-project-time-complexity-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 170) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-time-complexity-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0"'
ok(row.includes('<div'), 'det er kompleksitetsfaktorrækken')
ok(row.includes('flex flex-wrap justify-between gap-x-3 min-w-0 break-words'), 'rækken kan krympe')
ok(row.includes('>Kompleksitetsfaktor<'), 'etiketten ligger i rækken')
ok(!row.includes('complexity_multiplier'), 'faktoren er et andet sted')
ok(!row.includes('ai-project-complexity-factor'), 'faktorværdien er et andet sted')
ok(!row.includes('Størrelsesfaktor'), 'størrelsesfaktoren er en anden række')
ok(!row.includes('ai-project-size-factor-label'), 'størrelsesetiketten er et andet sted')
ok(!row.includes('base_hours'), 'basistiden er et andet sted')
ok(!row.includes('ai-project-base-time-row'), 'basistidsrækken er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-complexity-heading'), 'faktorernes overskrift er et andet sted')
ok(view.split(id).length === 2, 'kompleksitetsfaktorrækken findes en gang')
ok(view.split('data-testid="ai-project-complexity-factor"').length === 2, 'faktorværdien findes en gang')
ok(view.split(cell).length === 2, 'kompleksitetsfaktorrækkens klasse findes en gang')
ok(view.split(bare).length === 3, 'de andre rækker bliver')
ok(view.includes('data-testid="ai-project-complexity-factor">×{result.calculation.time.complexity_multiplier}'), 'faktoren bliver')
ok(view.includes('<div className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-time-size-row">\r\n                    <dt className="text-gray-500 break-words min-w-0" data-testid="ai-project-size-factor-label">'), 'størrelsesfaktorrækken kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-time-complexity-row-wrap-test')
