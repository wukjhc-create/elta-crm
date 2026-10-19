/**
 * Opsummeringskortets tal kan krympe. Vaerdien er uaendret.
 *   npx tsx scripts/ai-project-summary-value-wrap-test.ts
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
const id = 'data-testid="ai-project-summary-value"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 80) : ''
const expr = 'formatCurrency(result.calculation.price.total_price)'
ok(row.includes('text-xl font-bold break-words min-w-0'), 'tallet kan krympe')
ok(row.includes('font-bold'), 'vaegten bliver')
ok(row.includes('{value}'), 'vaerdien bliver i kortet')
ok(!row.includes(expr), 'totalprisen er en anden')
ok(!row.includes('{label}'), 'etiketten er en anden')
ok(view.split(id).length === 2, 'tallet findes en gang')
ok(view.split('text-xl font-bold').length === 2, 'talklassen findes en gang')
ok(view.includes(expr), 'totalprisen bliver')
ok(view.includes('label="Total pris"'), 'etiketten bliver')
ok(view.includes('ekskl. moms'), 'momsnoten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-summary-value-wrap-test')
