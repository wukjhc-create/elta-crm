/**
 * Bygningsinformationens liste kan krympe. Prislisten bliver bar. Elpunktlisten og tidslisten bliver.
 *   npx tsx scripts/ai-project-building-list-wrap-test.ts
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
const id = 'data-testid="ai-project-building-list"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 160, at + 40) : ''
const cell = 'className="space-y-2 text-sm break-words min-w-0" data-testid="ai-project-building-list"'
const bare = 'className="space-y-2 text-sm"'
ok(row.includes('<dl'), 'det er bygningslisten')
ok(row.includes('space-y-2 text-sm break-words min-w-0'), 'listen kan krympe')
ok(row.includes('>Bygningsinformation</h4>'), 'overskriften ligger over listen')
ok(row.includes('ai-project-building-heading'), 'bygningsoverskriften ligger over listen')
ok(!row.includes('Elpunkter'), 'elpunktlisten er en anden')
ok(!row.includes('Prisopbygning'), 'prislisten er en anden')
ok(!row.includes('Tidsberegning'), 'tidslisten er en anden')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('getBuildingTypeName'), 'bygningstypen er et andet sted')
ok(!row.includes('ai-project-time-list'), 'tidslisten er et andet sted')
ok(view.split(id).length === 2, 'bygningslisten findes en gang')
ok(view.split(cell).length === 2, 'bygningslistens klasse findes en gang')
ok(view.split(bare).length === 2, 'en anden liste bliver')
ok(view.includes('<h4 className="font-medium mb-3 break-words min-w-0" data-testid="ai-project-points-heading">Elpunkter</h4>\r\n                <dl className="space-y-2 text-sm break-words min-w-0" data-testid="ai-project-points-list">'), 'elpunktlisten kan krympe')
ok(view.includes('<h4 className="font-medium mb-3 break-words min-w-0" data-testid="ai-project-price-heading">Prisopbygning</h4>\r\n                <dl className="space-y-2 text-sm">'), 'prislisten bliver bar')
ok(view.includes('className="space-y-2 text-sm break-words min-w-0" data-testid="ai-project-time-list"'), 'tidslisten bliver')
ok(view.includes('break-words">{getBuildingTypeName(result.interpretation.building_type)}'), 'bygningstypen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-building-list-wrap-test')
