/**
 * Dagsoverskriften på den valgte dag ombrydes. calendarDayHeading er uændret.
 *   npx tsx scripts/calendar-day-heading-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calendarDayHeading } from '../src/lib/planning/calendar-day-heading'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(calendarDayHeading('2026-01-15') === 'torsdag 15. januar', 'dansk dag er uændret')
ok(calendarDayHeading(null) === 'Vælg en dag', 'ingen dag er uændret')

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="calendar-day-heading"')
const row = at >= 0 ? view.slice(at - 80, at + 90) : ''
ok(row.includes('break-words min-w-0'), 'dagsoverskriften ombrydes')
ok(row.includes('{calendarDayHeading(selectedDate)}'), 'kalenderen bruger overskriften')
ok(view.includes("timeZone: 'Europe/Copenhagen'") || readFileSync(join('src', 'lib', 'planning', 'calendar-day-heading.ts'), 'utf8').includes("timeZone: 'Europe/Copenhagen'"), 'dansk tid bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'dagsoverskriften klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-day-heading-wrap-test')
