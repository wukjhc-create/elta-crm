/**
 * Soegeresultatets liste til ladestander kan krympe. Kosten er uaendret.
 *   npx tsx scripts/ai-project-charger-list-wrap-test.ts
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
const id = 'data-testid="ai-project-charger-list"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('mt-2 max-h-48 overflow-auto divide-y text-sm break-words min-w-0'), 'listen kan krympe')
ok(row.includes('max-h-48 overflow-auto'), 'rulningen bliver')
ok(!row.includes('ai-project-charger-hit'), 'resultatet er et andet')
ok(!row.includes('formatCurrency(h.cost_price)'), 'kosten er en anden')
ok(view.split(id).length === 2, 'listen findes en gang')
ok(view.split('mt-2 max-h-48 overflow-auto divide-y text-sm').length === 2, 'listen findes en gang i filen')
ok(view.includes('data-testid="ai-project-charger-hit"'), 'resultatet bliver')
ok(view.includes('formatCurrency(h.cost_price)'), 'kosten er uaendret')
ok(view.includes('data-testid="charger-search-error"'), 'fejlteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-charger-list-wrap-test')
