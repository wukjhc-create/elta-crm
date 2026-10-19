/**
 * Historikafsnittet kan krympe. Overskrift og tom saetning er uaendrede.
 *   npx tsx scripts/ai-project-history-section-wrap-test.ts
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
const id = 'data-testid="ai-project-history-section"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('bg-white border rounded-lg p-6 mt-6 break-words min-w-0'), 'afsnittet kan krympe')
ok(!row.includes('Ingen tidligere analyser'), 'den tomme saetning er en anden')
ok(!row.includes('formatCurrency(analysis.total_price)'), 'prisen er en anden')
ok(view.split(id).length === 2, 'afsnittet findes en gang')
ok(view.includes('data-testid="ai-project-history-heading"'), 'overskriften bliver')
ok(view.includes('Seneste analyser'), 'overskriftsteksten bliver')
ok(view.includes('Ingen tidligere analyser endnu. Kør en analyse ovenfor, så den kan ses her.'), 'den tomme saetning bliver')
ok(view.includes('formatCurrency(analysis.total_price)'), 'prisen bliver')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'beskrivelsen forbliver to linjer')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-history-section-wrap-test')
