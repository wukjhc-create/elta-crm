/**
 * Dagsoverskriften er en dansk kalenderdag. Opgavelisten og datostrengen er uændret.
 *   npx tsx scripts/calendar-day-heading-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calendarDayHeading } from '../src/lib/planning/calendar-day-heading'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(calendarDayHeading(null) === 'Vælg en dag', 'ingen dag')
ok(calendarDayHeading('') === 'Vælg en dag', 'tom streng')
ok(calendarDayHeading('2026-01-15') === 'torsdag 15. januar', 'vinterdag')
ok(calendarDayHeading('2026-06-02') === 'tirsdag 2. juni', 'sommerdag')
ok(calendarDayHeading('2026-01-02') === 'fredag 2. januar', 'datoen skifter ikke ved midnat UTC')

const helper = readFileSync(join('src', 'lib', 'planning', 'calendar-day-heading.ts'), 'utf8')
ok(helper.includes("timeZone: 'Europe/Copenhagen'"), 'overskriften bruger dansk tid')
ok(helper.includes("copenhagenLocalToIso(selectedDate, '12:00')"), 'dagen er middag i København')

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
ok(view.includes('data-testid="calendar-day-heading"'), 'overskriften kan findes')
ok(view.includes('{calendarDayHeading(selectedDate)}'), 'kalenderen bruger overskriften')
ok(!view.includes("selectedDate + 'T12:00:00'"), 'datostrengen tolkes ikke som servertid')
ok(view.includes("new Date(task.due_date).toLocaleDateString('da-DK', { month: 'short' })"), 'opgavelistens dato er uændret')
ok(view.includes('Ingen besigtigelser eller opkald denne dag'), 'tom dag er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-day-heading-test')
