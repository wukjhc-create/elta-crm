/**
 * Størrelsesrækken i bygningsinformationen kan krympe. De andre rækker og værdien bliver.
 *   npx tsx scripts/ai-project-building-size-row-wrap-test.ts
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
const id = 'data-testid="ai-project-building-size-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 170) : ''
const cell = 'className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-building-size-row"'
const bare = 'className="flex flex-wrap justify-between gap-x-3 min-w-0"'
ok(row.includes('<div'), 'det er størrelsesrækken')
ok(row.includes('flex flex-wrap justify-between gap-x-3 min-w-0 break-words'), 'rækken kan krympe')
ok(row.includes('>Størrelse<'), 'etiketten ligger i rækken')
ok(row.includes('ai-project-building-size-label'), 'størrelsesetiketten ligger i rækken')
ok(!row.includes('building_size_m2'), 'størrelsen er et andet sted')
ok(!row.includes('Alder'), 'alder er en anden række')
ok(!row.includes('ai-project-building-age-label'), 'alderetiketten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('Type'), 'type er en anden række')
ok(!row.includes('ai-project-building-type-row'), 'typerækken er et andet sted')
ok(!row.includes('getBuildingTypeName'), 'bygningstypen er et andet sted')
ok(!row.includes('ai-project-building-list'), 'bygningslisten er et andet sted')
ok(view.split(id).length === 2, 'størrelsesrækken findes en gang')
ok(view.split(cell).length === 2, 'størrelsesrækkens klasse findes en gang')
ok(view.split(bare).length === 7, 'de andre rækker bliver')
ok(view.includes("break-words\">{result.interpretation.building_size_m2 || 'Ukendt'} m²"), 'størrelsen bliver')
ok(view.includes('<div className="flex flex-wrap justify-between gap-x-3 min-w-0 break-words" data-testid="ai-project-building-age-row">\r\n                    <dt className="text-gray-500 break-words min-w-0" data-testid="ai-project-building-age-label">'), 'aldersrækken kan krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-building-size-row-wrap-test')
