/**
 * Basistidsrækken i tidsberegningen kan krympe. De andre rækker og timetallet bliver.
 *   npx tsx scripts/ai-project-base-time-row-wrap-test.ts
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
const id = 'data-testid="ai-project-base-time-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 170) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-base-time-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0"'
ok(row.includes('<div'), 'det er basistidsrækken')
ok(row.includes('flex flex-wrap justify-between gap-x-3 min-w-0 break-words'), 'rækken kan krympe')
ok(row.includes('>Basis tid<'), 'etiketten ligger i rækken')
ok(row.includes('ai-project-base-time-label'), 'basistidsetiketten ligger i rækken')
ok(!row.includes('base_hours'), 'timetallet er et andet sted')
ok(!row.includes('ai-project-base-hours'), 'basistiden er et andet sted')
ok(!row.includes('Kompleksitetsfaktor'), 'kompleksitetsfaktoren er en anden række')
ok(!row.includes('ai-project-complexity-factor'), 'faktorrækken er et andet sted')
ok(!row.includes('total_hours'), 'totaltiden er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-time-list'), 'tidslisten er et andet sted')
ok(!row.includes('Tidsberegning'), 'overskriften er et andet sted')
ok(view.split(id).length === 2, 'basistidsrækken findes en gang')
ok(view.split(cell).length === 2, 'basistidsrækkens klasse findes en gang')
ok(view.split(bare).length === 3, 'de andre rækker bliver')
ok(view.includes('result.calculation.time.base_hours.toFixed(1)'), 'timetallet bliver')
ok(view.includes('<div className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-time-complexity-row">\r\n                    <dt className="text-gray-500 min-w-0 break-words">Kompleksitetsfaktor</dt>'), 'kompleksitetsfaktorrækken kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-base-time-row-wrap-test')
