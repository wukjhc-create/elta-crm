/**
 * Sektionens indhold kan krympe. {children} er uaendret.
 *   npx tsx scripts/ai-project-section-body-wrap-test.ts
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
const id = 'data-testid="ai-project-section-body"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="p-4 pt-0 border-t break-words min-w-0" data-testid="ai-project-section-body"'
ok(row.includes('p-4 pt-0 border-t break-words min-w-0'), 'indholdet kan krympe')
ok(row.includes('border-t'), 'kanten bliver')
ok(!row.includes('{children}'), 'indholdet er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('{title}'), 'titelteksten er et andet sted')
ok(!row.includes('ai-project-section-title-row'), 'titelraekken er et andet sted')
ok(!row.includes('ai-project-section-shell'), 'rammen er et andet sted')
ok(view.split(id).length === 2, 'indholdet findes en gang')
ok(view.split(cell).length === 2, 'indholdsklassen findes en gang')
ok(!view.includes('className="p-4 pt-0 border-t"'), 'det bare indhold er vaek')
ok(view.includes('data-testid="ai-project-section-body">{children}</div>'), 'indholdet bliver')
ok(view.split('{children}').length === 2, 'indholdet findes en gang')
ok(view.includes('font-semibold break-words min-w-0" data-testid="ai-project-section-heading">{title}'), 'titelteksten bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-section-body-wrap-test')
