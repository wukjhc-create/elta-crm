/**
 * Tilgaengelighedsfaktoren i tidsberegningen kan krympe. Faktoren er uaendret.
 *   npx tsx scripts/ai-project-accessibility-multiplier-wrap-test.ts
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
const id = 'data-testid="ai-project-accessibility-multiplier"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 120) : ''
const cell = 'className="min-w-0 break-words" data-testid="ai-project-accessibility-multiplier"'
ok(row.includes('min-w-0 break-words'), 'faktoren kan krympe')
ok(row.includes('<dd'), 'det er faktoren')
ok(row.includes('accessibility_multiplier'), 'faktoren bliver i raekken')
ok(!row.includes('size_multiplier'), 'stoerrelsen er et andet sted')
ok(!row.includes('total_hours'), 'totaltiden er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'faktoren findes en gang')
ok(view.split(cell).length === 2, 'faktorklassen findes en gang')
ok(!view.includes('<dd>×{result.calculation.time.accessibility_multiplier}</dd>'), 'den bare faktor er vaek')
ok(view.includes('data-testid="ai-project-size-multiplier"'), 'stoerrelsesfaktoren bliver')
ok(view.includes('result.calculation.time.accessibility_multiplier'), 'formlen bliver')
ok(view.split('>{title}<').length === 2, 'titelteksten findes en gang')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-accessibility-multiplier-wrap-test')
