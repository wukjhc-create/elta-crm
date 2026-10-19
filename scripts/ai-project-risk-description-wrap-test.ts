/**
 * Risikobeskrivelsen kan krympe. {risk.description} er uaendret.
 *   npx tsx scripts/ai-project-risk-description-wrap-test.ts
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
const id = 'data-testid="ai-project-risk-description"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="text-sm text-gray-600 mt-1 break-words min-w-0" data-testid="ai-project-risk-description">{risk.description}</div>'
ok(row.includes('text-sm text-gray-600 mt-1 break-words min-w-0'), 'beskrivelsen kan krympe')
ok(row.includes('mt-1'), 'afstanden bliver')
ok(!row.includes('{risk.description}'), 'beskrivelsen er et andet sted i snittet')
ok(!row.includes('{risk.title}'), 'titlen er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-risk-row'), 'raekken er et andet sted')
ok(!row.includes('Anbefaling:'), 'anbefalingen er et andet sted')
ok(view.split(id).length === 2, 'beskrivelsen findes en gang')
ok(view.split(cell).length === 2, 'beskrivelsesklassen findes en gang')
ok(view.split('{risk.description}').length === 2, 'teksten bliver')
ok(!view.includes('className="text-sm text-gray-600 mt-1"'), 'den bare beskrivelse er vaek')
ok(view.includes('className="font-medium">{risk.title}</div>'), 'titlen bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-risk-description-wrap-test')
