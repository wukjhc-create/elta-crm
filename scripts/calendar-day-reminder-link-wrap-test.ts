/**
 * Linket under dagens påmindelser ombrydes. Listen og overskriften er uændret.
 *   npx tsx scripts/calendar-day-reminder-link-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="calendar-day-reminder-link"')
const row = start >= 0 ? view.slice(start - 160, start + 160) : ''
ok(row.includes('break-words min-w-0'), 'linket ombrydes')
ok(row.includes('href="/dashboard/tasks"'), 'adressen er uændret')
ok(row.includes('Ret under Opgaver → Mine påmindelser'), 'linkteksten er uændret')
ok(view.includes('>Mine påmindelser<'), 'overskriften er uændret')
ok(view.includes('remindersByDate[selectedDate]!.map'), 'listen er uændret')
ok(view.includes("className={`text-sm ${r.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}"), 'listens klasser er uændret')
ok(view.includes('data-testid="calendar-day-reminder-count"'), 'tællingen er uændret')
ok(view.includes('(remindersByDate[selectedDate]?.length ?? 0) > 0'), 'blokken er skjult ved 0')
ok(!row.includes('.from('), 'ingen ny forespørgsel')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-day-reminder-link-wrap-test')
