/**
 * Den ansvarliges navn på den valgte dag ombrydes. Fejlteksten er uændret.
 *   npx tsx scripts/calendar-day-assignee-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const heading = view.indexOf('Kommende besigtigelser')
const day = heading >= 0 ? view.slice(0, heading) : ''
const at = day.indexOf('data-testid="calendar-day-assignee"')
const row = at >= 0 ? day.slice(at - 320, at + 160) : ''
ok(row.includes('break-words min-w-0'), 'navnet ombrydes')
ok(row.includes('{task.assigned_profile.full_name || task.assigned_profile.email}'), 'navnet er uændret')
ok(row.includes('{task.assigned_profile ?'), 'navnet vises kun når det findes')
ok(row.includes('<User className="w-3.5 h-3.5" />'), 'ikonet er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'navnet klippes ikke')

const errAt = day.indexOf('Navn kunne ikke hentes')
const err = errAt >= 0 ? day.slice(errAt - 280, errAt + 30) : ''
ok(err.includes('namesFailed && task.assigned_to'), 'fejlen vises kun når navnet mangler')
ok(err.includes('flex items-center gap-1.5 text-xs text-red-700'), 'fejlens udseende er uændret')
ok(err.includes('Navn kunne ikke hentes'), 'fejlteksten er uændret')
ok(!err.includes('break-words'), 'fejlteksten ombrydes ikke her')
ok(day.includes('break-words min-w-0">{info.address}'), 'besøgsadressen er uændret')
ok(!day.includes('.from('), 'ingen ny forespørgsel')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-day-assignee-wrap-test')
