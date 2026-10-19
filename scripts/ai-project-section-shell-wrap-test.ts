/**
 * Sammenklappelig sektions ramme kan krympe. {title} er uaendret.
 *   npx tsx scripts/ai-project-section-shell-wrap-test.ts
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
const id = 'data-testid="ai-project-section-shell"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="bg-white border rounded-lg break-words min-w-0" data-testid="ai-project-section-shell"'
ok(row.includes('bg-white border rounded-lg break-words min-w-0'), 'rammen kan krympe')
ok(row.includes('border'), 'kanten bliver')
ok(!row.includes('{title}'), 'titelteksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-section-toggle'), 'hovedet er et andet sted')
ok(!row.includes('p-6'), 'de andre rammer er et andet sted')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(cell).length === 2, 'rammeklassen findes en gang')
ok(!view.includes('className="bg-white border rounded-lg"'), 'den bare ramme er vaek')
ok(view.includes('font-semibold break-words min-w-0" data-testid="ai-project-section-heading">{title}'), 'titelteksten bliver')
ok(view.includes('bg-white border rounded-lg p-6 break-words min-w-0'), 'naeste skridt bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-section-shell-wrap-test')
