/**
 * Fortolkningsgitteret kan krympe. Kalkulationsgitteret bliver.
 *   npx tsx scripts/ai-project-interpretation-grid-wrap-test.ts
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
const id = 'data-testid="ai-project-interpretation-grid"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 280) : ''
const cell = 'className="grid grid-cols-1 md:grid-cols-2 gap-6 break-words min-w-0" data-testid="ai-project-interpretation-grid"'
const bare = 'className="grid grid-cols-1 md:grid-cols-2 gap-6"'
ok(row.includes('<div'), 'det er fortolkningsgitteret')
ok(row.includes('grid grid-cols-1 md:grid-cols-2 gap-6 break-words min-w-0'), 'gitteret kan krympe')
ok(row.includes('ai-project-building-column'), 'bygningskolonnen ligger i gitteret')
ok(row.includes('>Bygningsinformation</h4>'), 'overskriften ligger i gitteret')
ok(row.includes('ai-project-building-heading'), 'bygningsoverskriften ligger i gitteret')
ok(!row.includes('<dl'), 'listen er et andet sted')
ok(!row.includes('Elpunkter'), 'elpunktkolonnen er et andet sted')
ok(!row.includes('Prisopbygning'), 'kalkulationsgitteret er et andet sted')
ok(!row.includes('ai-project-price-column'), 'priskolonnen er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('getBuildingTypeName'), 'bygningstypen er et andet sted')
ok(view.split(id).length === 2, 'fortolkningsgitteret findes en gang')
ok(view.split(cell).length === 2, 'fortolkningsgitterets klasse findes en gang')
ok(view.split(bare).length === 2, 'kalkulationsgitteret bliver bart')
ok(view.includes('<div className="grid grid-cols-1 md:grid-cols-2 gap-6">\r\n              {/* Price Breakdown */}'), 'kalkulationsgitteret bliver')
ok(view.includes('break-words">{getBuildingTypeName(result.interpretation.building_type)}'), 'bygningstypen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-interpretation-grid-wrap-test')
