/**
 * "Klik på en dag" ombrydes. Den tomme dags sætning er uændret.
 *   npx tsx scripts/calendar-pick-day-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="calendar-pick-day"')
const pick = start >= 0 ? view.slice(start - 80, start + 120) : ''
ok(pick.includes('data-testid="calendar-pick-day"'), 'opfordringen kan findes')
ok(pick.includes('break-words min-w-0'), 'opfordringen ombrydes')
ok(pick.includes('Klik på en dag for at se besigtigelser og opkald'), 'teksten er uændret')
ok(!pick.includes('Ingen besigtigelser eller opkald denne dag'), 'den tomme dag er ikke denne tekst')
ok(view.includes('Ingen besigtigelser eller opkald denne dag'), 'den tomme dag er uændret')
ok(view.includes('{calendarDayHeading(selectedDate)}'), 'dagsoverskriften er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-pick-day-wrap-test')
