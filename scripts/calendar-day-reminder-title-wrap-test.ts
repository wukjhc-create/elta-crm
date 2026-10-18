/**
 * Titlerne i dagens påmindelsesliste ombrydes. Overskrift og link er uændret.
 *   npx tsx scripts/calendar-day-reminder-title-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dayReminderCountText } from '../src/lib/planning/day-task-count'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(dayReminderCountText(1) === '1 påmindelse', 'tællingen er uændret')
ok(dayReminderCountText(0) === null, 'nul skjules stadig')

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const at = view.indexOf('remindersByDate[selectedDate]!.map')
const row = at >= 0 ? view.slice(at, at + 420) : ''
ok(row.includes('text-sm break-words min-w-0'), 'titlen ombrydes')
ok(row.includes('copenhagenParts(r.due_at).clock'), 'klokken er uændret')
ok(row.includes('{r.title}'), 'titlen er uændret')
ok(row.includes("r.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'"), 'statusfarverne er uændret')
ok(view.includes('>Mine påmindelser<'), 'overskriften er uændret')
ok(view.includes('data-testid="calendar-day-reminder-link"'), 'linket bliver')
ok(view.includes('href="/dashboard/tasks"'), 'adressen er uændret')
ok(view.includes('Ret under Opgaver → Mine påmindelser'), 'linkteksten er uændret')
ok(view.includes('(remindersByDate[selectedDate]?.length ?? 0) > 0'), 'blokken er skjult ved 0')
ok(!row.includes('.from('), 'ingen ny forespørgsel')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'titlen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-day-reminder-title-wrap-test')
