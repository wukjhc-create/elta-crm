/**
 * Kundevælgerens indhold kan krympe. Søgefeltet og listen bliver.
 *   npx tsx scripts/ai-project-customer-body-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-body"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 50, at + 20) : ''
const cell = 'className="p-4 break-words min-w-0" data-testid="ai-project-customer-body"'
ok(row.includes('<div'), 'det er kundevælgerens indhold')
ok(row.includes('p-4 break-words min-w-0'), 'indholdet kan krympe')
ok(!row.includes('ai-project-customer-search-frame'), 'søgerammen er et andet sted')
ok(!row.includes('ai-project-customer-list'), 'listen er et andet sted')
ok(!row.includes('placeholder="Søg efter kunde..."'), 'pladsholderen er et andet sted')
ok(!row.includes('aria-label="Søg efter kunde"'), 'aria-label er et andet sted')
ok(!row.includes('ai-project-search-glyph'), 'søgeikonet er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-customer-head'), 'hovedet er et andet sted')
ok(view.split(id).length === 2, 'indholdet findes en gang')
ok(view.split(cell).length === 2, 'indholdets klasse findes en gang')
ok(view.split('className="p-4"').length === 1, 'den bare polstring er vaek')
ok(view.includes('data-testid="ai-project-customer-search-frame"'), 'søgerammen bliver')
ok(view.includes('data-testid="ai-project-customer-list"'), 'listen bliver')
ok(view.includes('placeholder="Søg efter kunde..."'), 'pladsholderen bliver')
ok(view.includes('aria-label="Søg efter kunde"'), 'aria-label bliver')
ok(view.includes('data-testid="ai-project-search-glyph"'), 'søgeikonet bliver')
ok(view.includes('data-testid="ai-project-customer-head"'), 'hovedet bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-body-wrap-test')
