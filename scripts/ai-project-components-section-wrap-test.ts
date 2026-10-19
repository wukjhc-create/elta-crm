/**
 * Komponentafsnittet kan krympe. Priserne er uaendret.
 *   npx tsx scripts/ai-project-components-section-wrap-test.ts
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
const id = 'data-testid="ai-project-components-section"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const cell = 'className="mt-6 break-words min-w-0" data-testid="ai-project-components-section"'
ok(row.includes('mt-6 break-words min-w-0'), 'afsnittet kan krympe')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('Komponenter'), 'overskriften er et andet sted')
ok(!row.includes('ai-components-mobile'), 'mobillisten er et andet sted')
ok(view.split(id).length === 2, 'afsnittet findes en gang')
ok(view.split(cell).length === 2, 'afsnitklassen findes en gang')
ok(!view.includes('className="mt-6"'), 'den bare ramme er væk')
ok(view.includes('>Komponenter</h4>'), 'overskriften bliver')
ok(view.includes('data-testid="ai-components-mobile"'), 'mobillisten bliver')
ok(view.includes('formatCurrency(comp.unit_price)'), 'enhedsprisen bliver')
ok(view.includes('formatCurrency(comp.total)'), 'totalen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-components-section-wrap-test')
