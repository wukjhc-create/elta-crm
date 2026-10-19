/**
 * Bygningstypen i hurtig estimat ombrydes. Udtrykket er uaendret.
 *   npx tsx scripts/ai-project-quick-building-wrap-test.ts
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
const id = 'data-testid="ai-project-quick-building"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 120) : ''
const expr = '{getBuildingTypeName(quickResult.buildingType)}'
ok(row.includes('break-words min-w-0'), 'bygningstypen ombrydes')
ok(row.includes(expr), 'udtrykket er uaendret')
ok(view.split(expr).length === 2, 'udtrykket findes en gang')
ok(view.includes('break-words">{getBuildingTypeName(result.interpretation.building_type)}'), 'fortolkningen bliver')
ok(view.includes('data-testid="ai-project-quick-points"'), 'elpunkt-tallet bliver')
ok(view.includes('{quickResult.totalPoints} elpunkter'), 'elpunktudtrykket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-quick-building-wrap-test')
