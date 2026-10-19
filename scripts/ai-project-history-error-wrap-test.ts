/**
 * Historikkens fejltekst kan krympe. Fejlteksten er uaendret.
 *   npx tsx scripts/ai-project-history-error-wrap-test.ts
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
const id = 'data-testid="ai-history-load-error"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 240) : ''
const cell = 'className="text-sm text-red-700 break-words min-w-0 text-center py-4" data-testid="ai-history-load-error"'
ok(row.includes('<p'), 'det er fejlteksten')
ok(row.includes('text-sm text-red-700 break-words min-w-0 text-center py-4'), 'fejlteksten kan krympe')
ok(row.includes('{historyError}'), 'fejlen bliver i raekken')
ok(row.includes('Det tælles ikke som ingen analyser.'), 'den tomme forklaring bliver')
ok(row.includes('De tidligere analyser bliver.'), 'de gemte analyser bliver')
ok(!row.includes('ai-project-history-retry'), 'prov-igen er et andet sted')
ok(!row.includes('ai-project-history-empty'), 'den tomme historik er et andet sted')
ok(!row.includes('Ingen tidligere analyser endnu'), 'tom-teksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('ai-quick-load-error'), 'hurtig-estimatets fejl er en anden')
ok(view.split(id).length === 2, 'fejlteksten findes en gang')
ok(view.split(cell).length === 2, 'fejltekstens klasse findes en gang')
ok(!view.includes('text-sm text-red-700 break-words text-center py-4"'), 'den gamle klasse er vaek')
ok(view.includes('data-testid="ai-project-history-retry"'), 'prov-igen bliver')
ok(view.includes('Ingen tidligere analyser endnu. Kør en analyse ovenfor, så den kan ses her.'), 'tom-teksten bliver')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'beskrivelsen bliver paa to linjer')
ok(view.includes('formatCurrency(analysis.total_price)'), 'historikprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-history-error-wrap-test')
