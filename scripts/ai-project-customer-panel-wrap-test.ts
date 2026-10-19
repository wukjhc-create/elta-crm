/**
 * Kundevaelgerens panel kan krympe. Hoejde og rulning er uaendret.
 *   npx tsx scripts/ai-project-customer-panel-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-panel"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('max-w-md mx-4 max-h-[90vh] overflow-y-auto break-words min-w-0'), 'panelet kan krympe')
ok(row.includes('overflow-y-auto'), 'rulning bliver')
ok(!row.includes('ai-project-customer-head'), 'hovedet er et andet')
ok(!row.includes('ai-project-customer-overlay'), 'baggrunden er en anden')
ok(view.split(id).length === 2, 'panelet findes en gang')
ok(view.split('max-w-md mx-4 max-h-[90vh] overflow-y-auto').length === 2, 'rulletekst findes en gang')
ok(view.includes('data-testid="ai-project-customer-head"'), 'hovedet bliver')
ok(view.includes('data-testid="ai-project-customer-overlay"'), 'baggrunden bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-panel-wrap-test')
