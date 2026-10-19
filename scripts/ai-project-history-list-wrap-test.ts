/**
 * Historikkens liste kan krympe. Beskrivelsen og prisen er uaendrede.
 *   npx tsx scripts/ai-project-history-list-wrap-test.ts
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
const id = 'data-testid="ai-project-history-list"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
ok(row.includes('space-y-2 break-words min-w-0'), 'listen kan krympe')
ok(row.includes('recentAnalyses.map'), 'raekkerne bliver')
ok(!row.includes('line-clamp-2'), 'beskrivelsen er en anden')
ok(!row.includes('formatCurrency(analysis.total_price)'), 'prisen er en anden')
ok(view.split(id).length === 2, 'listen findes en gang')
ok(view.split('className="space-y-2 break-words min-w-0"').length === 2, 'kun den liste')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'beskrivelsen forbliver to linjer')
ok(view.includes('formatCurrency(analysis.total_price)'), 'prisen bliver')
ok(view.includes('text-sm font-medium text-gray-900 shrink-0'), 'prisens shrink-0 bliver')
ok(view.includes('data-testid="ai-project-history-card"'), 'kortet bliver')
ok(view.includes('Ingen tidligere analyser endnu. Kør en analyse ovenfor, så den kan ses her.'), 'den tomme saetning bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-history-list-wrap-test')
