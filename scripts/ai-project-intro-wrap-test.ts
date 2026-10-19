/**
 * Indledningen på AI-projekt ombrydes. Sætningen er uændret.
 *   npx tsx scripts/ai-project-intro-wrap-test.ts
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
const sentence = 'Beskriv projektet og få automatisk kalkulation, risikovurdering og tilbudstekst'
const id = 'data-testid="ai-project-intro"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 200) : ''
ok(row.includes('break-words min-w-0'), 'indledningen ombrydes')
ok(row.includes(sentence), 'sætningen er uændret')
ok(view.split(sentence).length === 2, 'sætningen findes en gang')
ok(view.includes('<h1 className="text-2xl font-bold flex items-center gap-2">'), 'sidetitlen venter')
ok(view.includes('AI Projektanalyse'), 'sidetitelsteksten bliver')
ok(view.includes('data-testid="ai-project-next-step-heading"'), 'naeste skridt bliver')
ok(view.includes('formatCurrency(analysis.total_price)'), 'prisen er uændret')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'historikken bliver paa to linjer')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-intro-wrap-test')
