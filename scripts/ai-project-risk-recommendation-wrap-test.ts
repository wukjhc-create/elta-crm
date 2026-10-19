/**
 * Risikoanbefalingen kan krympe. Teksten Anbefaling: er uaendret.
 *   npx tsx scripts/ai-project-risk-recommendation-wrap-test.ts
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
const id = 'data-testid="ai-project-risk-recommendation"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="text-sm text-gray-500 mt-2 italic break-words min-w-0" data-testid="ai-project-risk-recommendation">'
ok(row.includes('text-sm text-gray-500 mt-2 italic break-words min-w-0'), 'anbefalingen kan krympe')
ok(row.includes('italic'), 'kursiven bliver')
ok(!row.includes('Anbefaling:'), 'teksten er et andet sted i snittet')
ok(!row.includes('{risk.recommendation}'), 'anbefalingsteksten er et andet sted i snittet')
ok(!row.includes('{risk.description}'), 'beskrivelsen er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-risk-description'), 'beskrivelsesid er et andet sted')
ok(view.split(id).length === 2, 'anbefalingen findes en gang')
ok(view.split(cell).length === 2, 'anbefalingsklassen findes en gang')
ok(view.split('Anbefaling:').length === 2, 'teksten Anbefaling bliver')
ok(view.split('{risk.recommendation}').length === 2, 'vaerdien bliver')
ok(!view.includes('className="text-sm text-gray-500 mt-2 italic"'), 'den bare anbefaling er vaek')
ok(view.includes('data-testid="ai-project-risk-description">{risk.description}</div>'), 'beskrivelsen bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-risk-recommendation-wrap-test')
