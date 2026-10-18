/**
 * Overskriften "Mine påmindelser" ombrydes. Ordene er uændret.
 *   npx tsx scripts/calendar-reminders-heading-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dayReminderCountText } from '../src/lib/planning/day-task-count'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(dayReminderCountText(2) === '2 påmindelser', 'tællingen er uændret')

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="calendar-reminders-heading"')
const row = at >= 0 ? view.slice(at - 140, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(row.includes('>Mine påmindelser<'), 'ordene er uændret')
ok(view.includes('data-testid="calendar-day-reminder-link"'), 'linket bliver')
ok(view.includes('Ret under Opgaver → Mine påmindelser'), 'linkteksten er uændret')
ok(view.includes('dayReminderCountText(remindersByDate[selectedDate]!.length)'), 'tællingen bruges stadig')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'overskriften klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-reminders-heading-wrap-test')
