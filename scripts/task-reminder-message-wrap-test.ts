/**
 * Beskeden i opgavepåmindelsen ombrydes. Teksten er uændret.
 *   npx tsx scripts/task-reminder-message-wrap-test.ts
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
const at = view.indexOf('data-testid="task-reminder-message"')
const row = at >= 0 ? view.slice(at - 160, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'beskeden ombrydes')
ok(row.includes('whitespace-pre-line'), 'linjeskift bliver')
ok(row.includes('>{alert.message}'), 'teksten er uændret')
ok(!row.includes('line-clamp-2'), 'den klippes ikke til to linjer')
ok(view.includes('aria-label="Luk prisadvarsel"'), 'luk bliver')
ok(view.includes('break-words min-w-0">{alert.title}'), 'titlen bliver')
ok(view.includes('break-words">{reminder.title}'), 'påmindelsestitlen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  task-reminder-message-wrap-test')
