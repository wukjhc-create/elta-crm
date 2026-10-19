/**
 * Fejlteksten ved ladestander-soegning kan krympe. Saetningerne er uaendrede.
 *   npx tsx scripts/ai-project-charger-error-wrap-test.ts
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
const id = 'data-testid="charger-search-error"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 200) : ''
ok(row.includes('break-words min-w-0'), 'fejlteksten kan krympe')
ok(row.includes('. Det tælles ikke som ingen ladestandere.'), 'tom-teksten er uaendret')
ok(row.includes('. De tidligere forslag bliver.'), 'forslagene er uaendrede')
ok(view.split(id).length === 2, 'feltet findes en gang')
ok(view.includes('formatCurrency(h.cost_price)'), 'kostprisen bliver')
ok(view.includes('data-testid="ai-project-charger-search"'), 'soegefeltet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-charger-error-wrap-test')
