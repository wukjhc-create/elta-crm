/**
 * Den tomme historiktekst i AI-projekt ombrydes. Sætningen er uændret.
 *   npx tsx scripts/ai-project-history-empty-wrap-test.ts
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
ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
const sentence = 'Ingen tidligere analyser endnu. Kør en analyse ovenfor, så den kan ses her.'
const id = 'data-testid="ai-project-history-empty"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 220) : ''
ok(row.includes('break-words min-w-0'), 'afsnittet ombrydes')
ok(row.includes(sentence), 'sætningen er uændret')
ok(view.split(sentence).length === 2, 'sætningen findes en gang')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'historikken bliver paa to linjer')
ok(view.includes('formatCurrency(analysis.total_price)'), 'prisen er uændret')
ok(view.includes('data-testid="ai-project-history-heading"'), 'overskriften bliver')
ok(view.includes('Seneste analyser'), 'overskriftsteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-history-empty-wrap-test')
