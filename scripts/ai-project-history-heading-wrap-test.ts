/**
 * Overskriften Seneste analyser ombrydes. Teksten er uændret.
 *   npx tsx scripts/ai-project-history-heading-wrap-test.ts
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
const id = 'data-testid="ai-project-history-heading"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 240) : ''
ok(row.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(row.includes('Seneste analyser'), 'teksten er uændret')
ok(view.split('Seneste analyser').length === 2, 'teksten findes en gang')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'historikken bliver paa to linjer')
ok(view.includes('formatCurrency(analysis.total_price)'), 'prisen er uændret')
ok(view.includes('Ingen tidligere analyser endnu. Kør en analyse ovenfor, så den kan ses her.'), 'den tomme historik bliver')
ok(view.includes('data-testid="ai-project-examples-heading"'), 'eksempeloverskriften bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-history-heading-wrap-test')
