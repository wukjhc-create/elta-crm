/**
 * Dagens påmindelser tælles fra den liste der allerede er hentet. 0 skjules.
 *   npx tsx scripts/calendar-day-reminder-count-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dayReminderCountText, dayTaskCountText } from '../src/lib/planning/day-task-count'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(dayReminderCountText(0) === null, 'nul skjules')
ok(dayReminderCountText(-1) === null, 'negativ skjules')
ok(dayReminderCountText(Number.NaN) === null, 'NaN skjules')
ok(dayReminderCountText(1) === '1 påmindelse', 'én påmindelse')
ok(dayReminderCountText(4) === '4 påmindelser', 'flere påmindelser')
ok(dayReminderCountText(2.9) === '2 påmindelser', 'decimal tælles ned')
ok(dayTaskCountText(1) === '1 opgave', 'opgavetællingen er uændret')

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="calendar-day-reminder-count"')
const row = start >= 0 ? view.slice(start - 40, start + 120) : ''
ok(row.includes('dayReminderCountText(remindersByDate[selectedDate]!.length)'), 'antallet kommer fra den hentede dag')
ok(view.includes('(remindersByDate[selectedDate]?.length ?? 0) > 0'), 'blokken er skjult ved 0')
ok(view.includes('>Mine påmindelser<'), 'overskriften er uændret')
ok(!row.includes('.from('), 'ingen ny forespørgsel')
ok(view.includes('dayTaskCountText(selectedTasks.length)'), 'opgaverne tælles stadig for sig')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-day-reminder-count-test')
