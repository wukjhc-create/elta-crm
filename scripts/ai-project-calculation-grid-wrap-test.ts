/**
 * Kalkulationsgitteret kan krympe. Fortolkningsgitteret og priserne bliver.
 *   npx tsx scripts/ai-project-calculation-grid-wrap-test.ts
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
const id = 'data-testid="ai-project-calculation-grid"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const cell = 'className="grid grid-cols-1 md:grid-cols-2 gap-6 break-words min-w-0" data-testid="ai-project-calculation-grid"'
const bare = 'className="grid grid-cols-1 md:grid-cols-2 gap-6"'
ok(row.includes('<div'), 'det er kalkulationsgitteret')
ok(row.includes('grid grid-cols-1 md:grid-cols-2 gap-6 break-words min-w-0'), 'gitteret kan krympe')
ok(row.includes('Price Breakdown'), 'prisopbygningen ligger i gitteret')
ok(!row.includes('Prisopbygning'), 'overskriften er et andet sted')
ok(!row.includes('ai-project-price-column'), 'priskolonnen er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-interpretation-grid'), 'fortolkningsgitteret er et andet sted')
ok(!row.includes('material_cost'), 'materialeprisen er et andet sted')
ok(view.split(id).length === 2, 'kalkulationsgitteret findes en gang')
ok(view.split(cell).length === 2, 'kalkulationsgitterets klasse findes en gang')
ok(view.split(bare).length === 1, 'den bare gitterklasse er vaek')
ok(view.includes('data-testid="ai-project-interpretation-grid"'), 'fortolkningsgitteret bliver')
ok(view.includes('formatCurrency(result.calculation.price.material_cost)'), 'materialeprisen bliver')
ok(view.includes('>Prisopbygning</h4>'), 'overskriften bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-calculation-grid-wrap-test')
