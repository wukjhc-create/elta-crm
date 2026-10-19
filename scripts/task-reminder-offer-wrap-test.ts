/**
 * Tilbudsnummeret i opgavepåmindelsen ombrydes. Teksten er uændret.
 *   npx tsx scripts/task-reminder-offer-wrap-test.ts
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
const id = 'data-testid="task-reminder-offer-number"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 160, at + 160) : ''
ok(row.includes('break-all min-w-0'), 'tilbudsnummeret ombrydes')
ok(row.includes('{reminder.offer.offer_number}'), 'teksten er uændret')
ok(view.includes('href={`/dashboard/offers/${reminder.offer.id}`}'), 'linket bliver')
ok(view.includes('break-words">{reminder.title}'), 'påmindelsestitlen bliver')
ok(view.includes('data-testid="task-reminder-message"'), 'beskeden bliver')
ok(view.includes('{alert.message}'), 'beskedteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  task-reminder-offer-wrap-test')
