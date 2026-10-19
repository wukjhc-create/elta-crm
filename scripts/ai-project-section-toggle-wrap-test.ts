/**
 * Sammenklappelig sektions hoved kan krympe. {title} er uaendret.
 *   npx tsx scripts/ai-project-section-toggle-wrap-test.ts
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
const id = 'data-testid="ai-project-section-toggle"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 40) : ''
const cell = 'className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors break-words min-w-0"'
ok(row.includes('w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors break-words min-w-0'), 'hovedet kan krympe')
ok(row.includes('hover:bg-gray-50'), 'hover bliver')
ok(!row.includes('{title}'), 'titelteksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('flex items-center gap-3'), 'titelraekken er et andet sted')
ok(!row.includes('font-semibold'), 'titeltekstens klasse er et andet sted')
ok(view.split(id).length === 2, 'hovedet findes en gang')
ok(view.split(cell).length === 2, 'hovedklassen findes en gang')
ok(!view.includes('className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"'), 'det bare hoved er vaek')
ok(view.includes('font-semibold break-words min-w-0" data-testid="ai-project-section-heading">{title}'), 'titelteksten bliver')
ok(view.split('>{title}<').length === 2, 'titelteksten findes en gang')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-section-toggle-wrap-test')
