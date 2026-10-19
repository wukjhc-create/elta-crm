/**
 * AI-projektets sideikon kan krympe. Overskriften er uaendret.
 *   npx tsx scripts/ai-project-page-sparkles-wrap-test.ts
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
const id = 'data-testid="ai-project-page-sparkles"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-6 h-6 text-purple-500 break-words min-w-0" data-testid="ai-project-page-sparkles" />'
ok(row.includes('w-6 h-6 text-purple-500 break-words min-w-0'), 'ikonet kan krympe')
ok(row.includes('text-purple-500'), 'farven bliver')
ok(!row.includes('AI Projektanalyse'), 'overskriften er et andet sted i snittet')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('className="w-6 h-6 text-purple-500"'), 'det bare ikon er vaek')
ok(view.split('AI Projektanalyse').length === 2, 'overskriften bliver')
ok(view.includes('<Sparkles className="w-5 h-5 mr-2" />'), 'analyseikonet bliver')
ok(view.includes('<Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />'), 'historikikonet bliver')
ok(view.includes('formatCurrency(analysis.total_price)'), 'historikprisen bliver')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'historikken bliver paa to linjer')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-page-sparkles-wrap-test')
