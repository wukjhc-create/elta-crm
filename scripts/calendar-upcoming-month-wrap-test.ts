/**
 * Måneden på kommende besigtigelser ombrydes. Dato-udtrykket er uændret.
 *   npx tsx scripts/calendar-upcoming-month-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { upcomingInspections } from '../src/lib/calendar/agenda'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(upcomingInspections([], '2026-06-02').length === 0, 'tom liste bliver tom')

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="calendar-upcoming-month"')
const row = at >= 0 ? view.slice(at - 280, at + 220) : ''
ok(row.includes('break-words min-w-0'), 'måneden ombrydes')
ok(row.includes("new Date(task.due_date).toLocaleDateString('da-DK', { month: 'short' })"), 'dato-udtrykket er uændret')
ok(!row.includes('timeZone'), 'dansk tidszone tilføjes ikke her')
ok(row.includes('new Date(task.due_date).getDate()'), 'dagsnummeret bliver')
ok(view.includes('data-testid="calendar-upcoming-heading"'), 'overskriften bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'måneden klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-upcoming-month-wrap-test')
