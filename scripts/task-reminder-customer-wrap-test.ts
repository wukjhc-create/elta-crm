/**
 * Kundenavnet i opgavepåmindelsen kan krympe. Teksten er uændret.
 *   npx tsx scripts/task-reminder-customer-wrap-test.ts
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
ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync('src/components/layout/task-reminder-overlay.tsx', 'utf8')
const id = 'data-testid="task-reminder-customer"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 180, at + 160) : ''
ok(row.includes('break-words min-w-0'), 'navnet kan krympe')
ok(row.includes('{reminder.customer.company_name}'), 'teksten er uændret')
ok(view.includes('data-testid="task-reminder-offer-number"'), 'tilbudsnummeret bliver')
ok(view.includes('href={`/dashboard/customers/${reminder.customer.id}`}'), 'linket bliver')
ok(view.includes('break-words">{reminder.title}'), 'påmindelsestitlen bliver')
ok(view.includes('data-testid="task-reminder-message"'), 'beskeden bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  task-reminder-customer-wrap-test')
