/**
 * Størrelsesfaktorrækken i tidsberegningen kan krympe. De andre rækker og faktoren bliver.
 *   npx tsx scripts/ai-project-time-size-row-wrap-test.ts
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
const id = 'data-testid="ai-project-time-size-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 180) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-time-size-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0"'
ok(row.includes('<div'), 'det er størrelsesfaktorrækken')
ok(row.includes('flex flex-wrap justify-between gap-x-3 min-w-0 break-words'), 'rækken kan krympe')
ok(row.includes('>Størrelsesfaktor<'), 'etiketten ligger i rækken')
ok(row.includes('ai-project-size-factor-label'), 'etikettens id ligger i rækken')
ok(!row.includes('size_multiplier'), 'faktoren er et andet sted')
ok(!row.includes('ai-project-size-multiplier'), 'faktorværdien er et andet sted')
ok(!row.includes('Tilgængelighedsfaktor'), 'tilgængelighedsfaktoren er en anden række')
ok(!row.includes('accessibility_multiplier'), 'tilgængelighedsfaktoren er et andet sted')
ok(!row.includes('ai-project-accessibility-multiplier'), 'tilgængelighedsværdien er et andet sted')
ok(!row.includes('complexity_multiplier'), 'kompleksitetsfaktoren er et andet sted')
ok(!row.includes('ai-project-time-complexity-row'), 'kompleksitetsfaktorrækken er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'størrelsesfaktorrækken findes en gang')
ok(view.split('data-testid="ai-project-size-factor-label"').length === 2, 'etiketten findes en gang')
ok(view.split('data-testid="ai-project-size-multiplier"').length === 2, 'faktorværdien findes en gang')
ok(view.split(cell).length === 2, 'størrelsesfaktorrækkens klasse findes en gang')
ok(view.split(bare).length === 2, 'de andre rækker bliver')
ok(view.includes('data-testid="ai-project-size-multiplier">×{result.calculation.time.size_multiplier}'), 'faktoren bliver')
ok(view.includes('<div className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-time-access-row">\r\n                    <dt className="text-gray-500 min-w-0 break-words">Tilgængelighedsfaktor</dt>'), 'tilgængelighedsfaktorrækken kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-time-size-row-wrap-test')
