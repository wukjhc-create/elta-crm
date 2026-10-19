/**
 * Opsummeringsgitteret paa AI-projekt kan krympe. Totalprisen er uaendret.
 *   npx tsx scripts/ai-project-summary-grid-wrap-test.ts
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
const id = 'data-testid="ai-project-summary-grid"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const expr = 'formatCurrency(result.calculation.price.total_price)'
ok(row.includes('grid grid-cols-1 md:grid-cols-4 gap-4 break-words min-w-0'), 'gitteret kan krympe')
ok(row.includes('md:grid-cols-4'), 'kolonnerne bliver')
ok(!row.includes(expr), 'totalprisen er en anden')
ok(!row.includes('ai-project-warnings-box'), 'bemaerkningerne er en anden')
ok(view.split(id).length === 2, 'gitteret findes en gang')
ok(view.split('grid grid-cols-1 md:grid-cols-4 gap-4').length === 2, 'gitterklassen findes en gang her')
ok(view.split(expr).length === 3, 'totalprisen bruges to steder')
ok(view.includes('label="Total pris"'), 'etiketten bliver')
ok(view.includes('ekskl. moms'), 'momsnoten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-summary-grid-wrap-test')
