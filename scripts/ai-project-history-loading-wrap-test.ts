/**
 * Historikkens indlaesning kan krympe. Den tomme saetning og prisen er uaendrede.
 *   npx tsx scripts/ai-project-history-loading-wrap-test.ts
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
const id = 'data-testid="ai-project-history-loading"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 240) : ''
ok(row.includes('break-words min-w-0'), 'indlaesningen kan krympe')
ok(row.includes('animate-pulse space-y-3'), 'pulsen bliver')
ok(row.split('h-10 bg-gray-200 rounded break-words min-w-0').length === 3, 'begge bjaelker bliver')
ok(!row.includes('Ingen tidligere analyser'), 'den tomme saetning er en anden')
ok(!row.includes('formatCurrency(analysis.total_price)'), 'prisen er en anden')
ok(view.split(id).length === 2, 'indlaesningen findes en gang')
ok(view.includes('Ingen tidligere analyser endnu. Kør en analyse ovenfor, så den kan ses her.'), 'den tomme saetning bliver')
ok(view.includes('formatCurrency(analysis.total_price)'), 'prisen bliver')
ok(view.includes('text-sm font-medium text-gray-900 shrink-0 break-words min-w-0" data-testid="ai-project-history-price"'), 'prisens shrink-0 bliver')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'beskrivelsen forbliver to linjer')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-history-loading-wrap-test')
