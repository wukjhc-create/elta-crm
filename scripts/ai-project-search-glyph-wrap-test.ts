/**
 * Soegeikonet i kundevaelgeren kan krympe. Pladsholderen er uaendret.
 *   npx tsx scripts/ai-project-search-glyph-wrap-test.ts
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
const id = 'data-testid="ai-project-search-glyph"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 40) : ''
const cell = 'className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 break-words min-w-0" data-testid="ai-project-search-glyph"'
ok(row.includes('absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 break-words min-w-0'), 'ikonet kan krympe')
ok(row.includes('text-gray-400'), 'farven bliver')
ok(row.includes('<Search'), 'det er soegeikonet')
ok(!row.includes('placeholder="Søg efter kunde..."'), 'pladsholderen er et andet sted')
ok(!row.includes('ai-project-customer-search"'), 'soegefeltet er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />'), 'det bare soegeikon er vaek')
ok(view.includes('placeholder="Søg efter kunde..."'), 'pladsholderen bliver')
ok(view.includes('aria-label="Søg efter kunde"'), 'aria-label bliver')
ok(view.includes('data-testid="ai-project-customer-search"'), 'soegefeltet bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-search-glyph-wrap-test')
