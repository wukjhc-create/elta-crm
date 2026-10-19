/**
 * Kundekortet i kundevaelgeren kan krympe. Valg, navn og mail er uaendret.
 *   npx tsx scripts/ai-project-customer-card-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-card"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 320, at + 160) : ''
ok(row.includes('break-words min-w-0'), 'kortet kan krympe')
ok(row.includes('handleSelectCustomer(customer.id)'), 'valget bliver')
ok(row.includes('font-medium break-words">{customer.name}'), 'navnet ombrydes som foer')
ok(view.split(id).length === 2, 'kortet findes en gang')
ok(view.includes('text-sm text-gray-500 break-words">{customer.email}'), 'mailen ombrydes som foer')
ok(view.includes('aria-label="Søg efter kunde"'), 'soegningen bliver')
ok(view.includes('data-testid="ai-project-customer-cancel"'), 'annuller bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-card-wrap-test')
