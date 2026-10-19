/**
 * Bygningsinformationens kolonne kan krympe. Elpunktkolonnen og listen bliver.
 *   npx tsx scripts/ai-project-building-column-wrap-test.ts
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
const id = 'data-testid="ai-project-building-column"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 180) : ''
const cell = 'className="break-words min-w-0" data-testid="ai-project-building-column"'
ok(row.includes('<div'), 'det er bygningskolonnen')
ok(row.includes('break-words min-w-0'), 'kolonnen kan krympe')
ok(row.includes('>Bygningsinformation</h4>'), 'overskriften ligger i kolonnen')
ok(row.includes('ai-project-building-heading'), 'bygningsoverskriften ligger i kolonnen')
ok(!row.includes('<dl'), 'listen er et andet sted')
ok(!row.includes('ai-project-building-list'), 'bygningslisten er et andet sted')
ok(!row.includes('Elpunkter'), 'elpunktkolonnen er en anden')
ok(!row.includes('getBuildingTypeName'), 'bygningstypen er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'bygningskolonnen findes en gang')
ok(view.split(cell).length === 2, 'bygningskolonens klasse findes en gang')
ok(!view.includes('<div>\r\n                <h4 className="font-medium mb-3 break-words min-w-0" data-testid="ai-project-building-heading">'), 'den bare bygningskolonne er vaek')
ok(view.includes('<div className="break-words min-w-0" data-testid="ai-project-points-column">\r\n                <h4 className="font-medium mb-3 break-words min-w-0" data-testid="ai-project-points-heading">'), 'elpunktkolonnen kan krympe')
ok(view.includes('className="break-words min-w-0" data-testid="ai-project-price-column"'), 'priskolonnen bliver')
ok(view.includes('break-words">{getBuildingTypeName(result.interpretation.building_type)}'), 'bygningstypen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-building-column-wrap-test')
