/**
 * Knappen Proev igen under seneste analyser kan krympe. Tekst og klik er uaendret.
 *   npx tsx scripts/ai-project-history-retry-wrap-test.ts
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
const id = 'data-testid="ai-project-history-retry"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 160, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(row.split('Prøv igen').length === 2, 'teksten er uaendret')
ok(row.includes('setHistoryTry((n) => n + 1)'), 'klikket bliver')
ok(row.includes('min-h-[44px]'), 'hoejden bliver')
ok(!row.includes('void loadCustomers()'), 'kundeknappen er en anden')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split('Prøv igen').length === 3, 'begge knapper bliver')
ok(view.includes('void loadCustomers()'), 'kundehentningen bliver')
ok(view.includes('formatCurrency(analysis.total_price)'), 'prisen er uaendret')
ok(view.includes('text-sm text-gray-700 break-words line-clamp-2">{analysis.description}'), 'beskrivelsen bliver paa to linjer')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-history-retry-wrap-test')
