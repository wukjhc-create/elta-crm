/**
 * Typerækken i bygningsinformationen kan krympe. De andre rækker og værdien bliver.
 *   npx tsx scripts/ai-project-building-type-row-wrap-test.ts
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
const id = 'data-testid="ai-project-building-type-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 170) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-building-type-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0"'
ok(row.includes('<div'), 'det er typerækken')
ok(row.includes('flex flex-wrap justify-between gap-x-3 min-w-0 break-words'), 'rækken kan krympe')
ok(row.includes('>Type<'), 'etiketten ligger i rækken')
ok(row.includes('ai-project-building-type-label'), 'typeetiketten ligger i rækken')
ok(!row.includes('getBuildingTypeName'), 'bygningstypen er et andet sted')
ok(!row.includes('Størrelse'), 'størrelse er en anden række')
ok(!row.includes('ai-project-building-size-label'), 'størrelsesetiketten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('Alder'), 'alder er en anden række')
ok(!row.includes('ai-project-building-list'), 'bygningslisten er et andet sted')
ok(view.split(id).length === 2, 'typerækken findes en gang')
ok(view.split(cell).length === 2, 'typerækkens klasse findes en gang')
ok(view.split(bare).length === 1, 'de andre rækker bliver')
ok(view.includes('break-words">{getBuildingTypeName(result.interpretation.building_type)}'), 'bygningstypen bliver')
ok(view.includes('<div className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-building-size-row">\r\n                    <dt className="text-gray-500 break-words min-w-0" data-testid="ai-project-building-size-label">'), 'størrelsesrækken kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-building-type-row-wrap-test')
