/**
 * Tilgængelighedsfaktorrækken i tidsberegningen kan krympe. De andre rækker og faktoren bliver.
 *   npx tsx scripts/ai-project-time-access-row-wrap-test.ts
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
const id = 'data-testid="ai-project-time-access-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 140) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-time-access-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0"'
ok(row.includes('<div'), 'det er tilgængelighedsfaktorrækken')
ok(row.includes('flex flex-wrap justify-between gap-x-3 min-w-0 break-words'), 'rækken kan krympe')
ok(row.includes('>Tilgængelighedsfaktor<'), 'etiketten ligger i rækken')
ok(!row.includes('accessibility_multiplier'), 'faktoren er et andet sted')
ok(!row.includes('ai-project-accessibility-multiplier'), 'faktorværdien er et andet sted')
ok(!row.includes('size_multiplier'), 'størrelsesfaktoren er et andet sted')
ok(!row.includes('ai-project-time-size-row'), 'størrelsesfaktorrækken er et andet sted')
ok(!row.includes('Størrelsesfaktor'), 'størrelsesetiketten er et andet sted')
ok(!row.includes('total_hours'), 'totaltiden er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('getPointTypeName'), 'elpunkterne er et andet sted')
ok(view.split(id).length === 2, 'tilgængelighedsfaktorrækken findes en gang')
ok(view.split('data-testid="ai-project-accessibility-multiplier"').length === 2, 'faktorværdien findes en gang')
ok(view.split(cell).length === 2, 'tilgængelighedsfaktorrækkens klasse findes en gang')
ok(view.split(bare).length === 2, 'de andre rækker bliver')
ok(view.includes('data-testid="ai-project-accessibility-multiplier">×{result.calculation.time.accessibility_multiplier}'), 'faktoren bliver')
ok(view.includes('<div key={key} className="flex flex-wrap justify-between gap-x-3 min-w-0">\r\n                        <dt className="text-gray-500 min-w-0 break-words">{getPointTypeName(key)}</dt>'), 'elpunktrækken bliver bar')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-time-access-row-wrap-test')
