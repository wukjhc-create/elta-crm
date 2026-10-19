/**
 * Historikkens eksempelikon kan krympe. Beskrivelsen forbliver to linjer.
 *   npx tsx scripts/ai-project-history-sparkles-wrap-test.ts
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
const id = 'data-testid="ai-project-history-sparkles"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 100, at + 40) : ''
const cell = 'className="w-4 h-4 text-purple-400 shrink-0 mt-0.5 break-words min-w-0" data-testid="ai-project-history-sparkles"'
const desc = 'text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'
ok(row.includes('w-4 h-4 text-purple-400 shrink-0 mt-0.5 break-words min-w-0'), 'historikikonet kan krympe')
ok(row.includes('<Sparkles'), 'det er historikikonet')
ok(!row.includes('line-clamp-2'), 'to-linjers klippet er et andet sted')
ok(!row.includes('{analysis.description}'), 'beskrivelsen er et andet sted')
ok(!row.includes('formatCurrency'), 'prisen er et andet sted')
ok(!row.includes('ai-project-history-card'), 'kortet er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('<Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />'), 'det bare ikon er vaek')
ok(view.includes(desc), 'beskrivelsen forbliver to linjer')
ok(view.split(desc).length === 2, 'beskrivelsen findes en gang')
ok(view.includes('formatCurrency(analysis.total_price)'), 'prisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-history-sparkles-wrap-test')
