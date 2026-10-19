/**
 * Kompleksitetsrækken i bygningsinformationen kan krympe. De andre rækker og værdien bliver.
 *   npx tsx scripts/ai-project-building-complexity-row-wrap-test.ts
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
const id = 'data-testid="ai-project-building-complexity-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 190) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-building-complexity-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0"'
ok(row.includes('<div'), 'det er kompleksitetsrækken')
ok(row.includes('flex flex-wrap justify-between gap-x-3 min-w-0 break-words'), 'rækken kan krympe')
ok(row.includes('>Kompleksitet<'), 'etiketten ligger i rækken')
ok(row.includes('ai-project-building-complexity-label'), 'kompleksitetsetiketten ligger i rækken')
ok(!row.includes('getComplexityLabel'), 'kompleksiteten er et andet sted')
ok(!row.includes('complexity_score'), 'scoren er et andet sted')
ok(!row.includes('Kompleksitetsfaktor'), 'tidsfaktoren er en anden række')
ok(!row.includes('ai-project-complexity-heading'), 'faktorernes overskrift er et andet sted')
ok(!row.includes('ai-project-complexity-chips'), 'faktorernes chip-række er et andet sted')
ok(!row.includes('Alder'), 'alder er en anden række')
ok(!row.includes('ai-project-building-age-row'), 'aldersrækken er et andet sted')
ok(!row.includes('getPointTypeName'), 'elpunkterne er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-building-list'), 'bygningslisten er et andet sted')
ok(view.split(id).length === 2, 'kompleksitetsrækken findes en gang')
ok(view.split(cell).length === 2, 'kompleksitetsrækkens klasse findes en gang')
ok(view.split(bare).length === 6, 'de andre rækker bliver')
ok(view.includes('break-words">{getComplexityLabel(result.interpretation.complexity_score)}'), 'kompleksiteten bliver')
ok(view.includes('<div key={key} className="flex flex-wrap justify-between gap-x-3 min-w-0">\r\n                        <dt className="text-gray-500 min-w-0 break-words">{getPointTypeName(key)}</dt>'), 'elpunktrækken bliver bar')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-building-complexity-row-wrap-test')
