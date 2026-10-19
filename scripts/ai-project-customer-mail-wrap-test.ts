/**
 * Kundens e-mail i kundevaelgeren kan krympe. Adressen er uaendret.
 *   npx tsx scripts/ai-project-customer-mail-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-mail"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
const cell = 'className="text-sm text-gray-500 break-words min-w-0" data-testid="ai-project-customer-mail"'
ok(row.includes('<div'), 'det er mailen')
ok(row.includes('text-sm text-gray-500 break-words min-w-0'), 'mailen kan krympe')
ok(row.includes('{customer.email}'), 'adressen bliver i raekken')
ok(!row.includes('{customer.name}'), 'navnet er et andet sted')
ok(!row.includes('ai-project-customer-card'), 'kortet er et andet sted')
ok(!row.includes('ai-project-customer-empty'), 'den tomme liste er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('handleSelectCustomer'), 'valget er et andet sted')
ok(view.split(id).length === 2, 'mailen findes en gang')
ok(view.split(cell).length === 2, 'mailens klasse findes en gang')
ok(!view.includes('text-sm text-gray-500 break-words">{customer.email}'), 'den gamle mailklasse er vaek')
ok(view.includes('{customer.email && ('), 'mailen vises stadig kun naar den findes')
ok(view.includes('font-medium break-words">{customer.name}'), 'navnet bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-mail-wrap-test')
