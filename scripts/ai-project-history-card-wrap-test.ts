/**
 * Historikkortet paa AI-projekt kan krympe. Beskrivelse og pris er uaendret.
 *   npx tsx scripts/ai-project-history-card-wrap-test.ts
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
const id = 'data-testid="ai-project-history-card"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'kortet kan krympe')
ok(row.includes('hover:bg-gray-50'), 'rammen bliver')
ok(view.split(id).length === 2, 'kortet findes en gang')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'beskrivelsen bliver paa to linjer')
ok(view.includes('formatCurrency(analysis.total_price)'), 'prisen er uaendret')
ok(view.includes('text-sm font-medium text-gray-900 shrink-0'), 'prisens shrink-0 bliver')
ok(view.includes('data-testid="ai-project-history-date"'), 'datoen paa kortet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-history-card-wrap-test')
