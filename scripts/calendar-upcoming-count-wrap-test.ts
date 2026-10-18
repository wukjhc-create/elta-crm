/**
 * "Viser … af …" under kommende besigtigelser ombrydes. Tællingen er uændret.
 *   npx tsx scripts/calendar-upcoming-count-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { upcomingInspections } from '../src/lib/calendar/agenda'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const many = Array.from({ length: 12 }, (_, i) => ({
  id: `d${i}`,
  due_date: `2026-11-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
  status: 'pending',
}))
ok(upcomingInspections(many, '2026-10-18').length === 12, 'funktionen skærer ikke selv')

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
ok(view.includes('shownUpcoming = upcomingTasks.slice(0, 10)'), 'loftet er 10')
const at = view.indexOf('data-testid="calendar-upcoming-count"')
const row = at >= 0 ? view.slice(at - 220, at + 180) : ''
ok(row.includes('break-words min-w-0'), 'tællingen ombrydes')
ok(row.includes('Viser {shownUpcoming.length} af {upcomingTasks.length}. Resten ligger i månedskalenderen.'), 'sætningen er uændret')
ok(row.includes('upcomingTasks.length > shownUpcoming.length'), 'noticen vises kun når der er flere')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'tællingen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-upcoming-count-wrap-test')
