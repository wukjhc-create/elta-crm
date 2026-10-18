/**
 * "+N mere" på månedsdagen ombrydes. Tællingen er uændret. Dagbrikkerne afkortes stadig.
 *   npx tsx scripts/calendar-day-more-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="calendar-day-more"')
const row = at >= 0 ? view.slice(at - 80, at + 70) : ''
ok(row.includes('break-words min-w-0'), 'tallet ombrydes')
ok(row.includes('+{dayTasks.length - 3} mere'), 'tællingen er uændret')
ok(view.includes('dayTasks.length > 3'), 'linjen vises kun over tre')
ok(view.includes('leading-tight px-1 py-0.5 rounded mb-0.5 truncate'), 'dagbrikkerne afkortes stadig')
ok(view.includes('+{(remindersByDate[dateKey]?.length ?? 0) - 2} påmindelser'), 'påmindelsestællingen er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'tallet klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-day-more-wrap-test')
