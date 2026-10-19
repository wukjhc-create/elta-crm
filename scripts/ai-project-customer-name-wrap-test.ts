/**
 * Kundens navn i kundevaelgeren kan krympe. Navnet er uaendret.
 *   npx tsx scripts/ai-project-customer-name-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-name"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const cell = 'className="font-medium break-words min-w-0" data-testid="ai-project-customer-name"'
ok(row.includes('<div'), 'det er navnet')
ok(row.includes('font-medium break-words min-w-0'), 'navnet kan krympe')
ok(row.includes('{customer.name}'), 'navnet bliver i raekken')
ok(!row.includes('{customer.email}'), 'mailen er et andet sted')
ok(!row.includes('ai-project-customer-mail'), 'mailen er et andet id')
ok(!row.includes('ai-project-customer-card'), 'kortet er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('handleSelectCustomer'), 'valget er et andet sted')
ok(view.split(id).length === 2, 'navnet findes en gang')
ok(view.split(cell).length === 2, 'navnets klasse findes en gang')
ok(!view.includes('font-medium break-words">{customer.name}'), 'den gamle navneklasse er vaek')
ok(view.includes('data-testid="ai-project-customer-mail">{customer.email}'), 'mailen bliver')
ok(view.includes('handleSelectCustomer(customer.id)'), 'valget bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-name-wrap-test')
