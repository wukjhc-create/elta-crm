/**
 * Historikikonet kan krympe. Overskriften Seneste analyser er uaendret.
 *   npx tsx scripts/ai-project-history-clock-wrap-test.ts
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
const id = 'data-testid="ai-project-history-clock"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-5 h-5 text-gray-500 break-words min-w-0" data-testid="ai-project-history-clock" />'
ok(row.includes('w-5 h-5 text-gray-500 break-words min-w-0'), 'ikonet kan krympe')
ok(row.includes('text-gray-500'), 'farven bliver')
ok(!row.includes('Seneste analyser'), 'overskriften er et andet sted i snittet')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-project-history-text'), 'tekstkolonnen er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split('Seneste analyser').length === 2, 'overskriften bliver')
ok(!view.includes('className="w-5 h-5 text-gray-500"'), 'det bare ikon er vaek')
ok(view.includes('data-testid="ai-project-history-heading"'), 'overskriftsid bliver')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'beskrivelsen forbliver to linjer')
ok(view.includes('formatCurrency(analysis.total_price)'), 'prisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-history-clock-wrap-test')
