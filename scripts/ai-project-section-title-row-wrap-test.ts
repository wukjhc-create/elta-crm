/**
 * Sektionens titelraekke kan krympe. {title} er uaendret.
 *   npx tsx scripts/ai-project-section-title-row-wrap-test.ts
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
const id = 'data-testid="ai-project-section-title-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="flex items-center gap-3 break-words min-w-0" data-testid="ai-project-section-title-row"'
ok(row.includes('flex items-center gap-3 break-words min-w-0'), 'raekken kan krympe')
ok(row.includes('gap-3'), 'mellemrummet bliver')
ok(!row.includes('{title}'), 'titelteksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('font-semibold'), 'titeltekstens klasse er et andet sted')
ok(!row.includes('ai-project-section-toggle'), 'hovedet er et andet sted')
ok(!row.includes('ai-project-section-shell'), 'rammen er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkeklassen findes en gang')
ok(!view.includes('className="flex items-center gap-3"'), 'den bare raekke er vaek')
ok(view.includes('font-semibold">{title}'), 'titelteksten bliver')
ok(view.split('>{title}<').length === 2, 'titelteksten findes en gang')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-section-title-row-wrap-test')
