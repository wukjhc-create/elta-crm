/**
 * Risikotitlen kan krympe. {risk.title} er uaendret.
 *   npx tsx scripts/ai-project-risk-title-wrap-test.ts
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
const id = 'data-testid="ai-project-risk-title"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="font-medium break-words min-w-0" data-testid="ai-project-risk-title">{risk.title}</div>'
ok(row.includes('font-medium break-words min-w-0'), 'titlen kan krympe')
ok(row.includes('font-medium'), 'vaegten bliver')
ok(!row.includes('{risk.title}'), 'titlen er et andet sted i snittet')
ok(!row.includes('{risk.description}'), 'beskrivelsen er et andet sted')
ok(!row.includes('ai-project-risk-description'), 'beskrivelsesid er et andet sted')
ok(!row.includes('ai-project-risk-row'), 'raekken er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'titlen findes en gang')
ok(view.split(cell).length === 2, 'titelklassen findes en gang')
ok(view.split('{risk.title}').length === 2, 'teksten bliver')
ok(!view.includes('className="font-medium"'), 'den bare titel er vaek')
ok(view.includes('data-testid="ai-project-risk-description">{risk.description}</div>'), 'beskrivelsen bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-risk-title-wrap-test')
