/**
 * Kundens soegefelt i AI-projekt kan krympe. Pladsholder og aria-label er uaendret.
 *   npx tsx scripts/ai-project-customer-search-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-search"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 480) : ''
ok(row.includes('break-words min-w-0'), 'soegefeltet kan krympe')
ok(row.includes('placeholder="Søg efter kunde..."'), 'pladsholderen er uaendret')
ok(row.includes('aria-label="Søg efter kunde"'), 'aria-label er uaendret')
ok(row.includes('value={customerSearch}'), 'vaerdien bliver')
ok(row.includes('onChange={(e) => setCustomerSearch(e.target.value)}'), 'aendringen bliver')
ok(view.split(id).length === 2, 'feltet findes en gang')
ok(view.split('placeholder="Søg efter kunde..."').length === 2, 'pladsholderen findes en gang')
ok(view.includes("'Ingen kunder'"), 'tom liste bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-search-wrap-test')
