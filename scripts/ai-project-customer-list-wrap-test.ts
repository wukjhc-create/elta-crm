/**
 * Kundelisten i kundevaelgeren kan krympe. Hoejde og rulning er uaendret.
 *   npx tsx scripts/ai-project-customer-list-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-list"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
ok(row.includes('break-words min-w-0'), 'listen kan krympe')
ok(row.includes('max-h-64'), 'hoejden bliver')
ok(row.includes('overflow-y-auto'), 'rulningen bliver')
ok(view.split(id).length === 2, 'listen findes en gang')
ok(view.includes('data-testid="ai-project-customer-card"'), 'kundekortet bliver')
ok(view.includes("'Ingen kunder'"), 'tom liste bliver')
ok(view.includes('max-w-md mx-4 max-h-[90vh] overflow-y-auto'), 'panelet kan stadig rulles')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-list-wrap-test')
