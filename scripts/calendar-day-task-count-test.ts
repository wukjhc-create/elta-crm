/**
 * Dagens overskrift tæller opgaver der allerede er hentet. Tom dag er ikke 0.
 *   npx tsx scripts/calendar-day-task-count-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dayTaskCountText } from '../src/lib/planning/day-task-count'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(dayTaskCountText(0) === null, 'nul skjules')
ok(dayTaskCountText(-1) === null, 'negativ skjules')
ok(dayTaskCountText(Number.NaN) === null, 'NaN skjules')
ok(dayTaskCountText(1) === '1 opgave', 'én opgave')
ok(dayTaskCountText(3) === '3 opgaver', 'flere opgaver')
ok(dayTaskCountText(2.9) === '2 opgaver', 'decimal tælles ned')

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
ok(view.includes('dayTaskCountText(selectedTasks.length)'), 'tællingen bruger de hentede opgaver')
ok(view.includes('data-testid="calendar-day-task-count"'), 'antallet kan findes')
ok(view.includes('Ingen besigtigelser eller opkald denne dag'), 'tom dag er uændret')
ok(view.includes('>Mine påmindelser<'), 'påmindelser tælles ikke her')
ok(view.includes('leading-tight px-1 py-0.5 rounded mb-0.5 truncate'), 'dagkortet er stadig afkortet')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-day-task-count-test')
