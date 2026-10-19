/**
 * Kundevaelgerens baggrund kan krympe. Panelet kan stadig rulles.
 *   npx tsx scripts/ai-project-customer-overlay-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-overlay"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
ok(row.includes('fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 break-words min-w-0'), 'baggrunden kan krympe')
ok(!row.includes('max-h-[90vh]'), 'panelet er et andet')
ok(view.split(id).length === 2, 'baggrunden findes en gang')
ok(view.includes('max-w-md mx-4 max-h-[90vh] overflow-y-auto'), 'panelet kan rulles')
ok(view.includes('showCustomerModal'), 'vaelgeren bliver')
ok(view.includes('data-testid="ai-project-customer-head"'), 'hovedet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-overlay-wrap-test')
