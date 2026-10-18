/**
 * Overskriften "Kalender — Besigtigelser" ombrydes. Ordene er uændret.
 *   npx tsx scripts/calendar-page-title-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="calendar-page-title"')
const row = at >= 0 ? view.slice(at - 220, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(row.includes('Kalender — Besigtigelser'), 'ordene er uændret')
ok(row.includes('<CalendarCheck className="w-7 h-7 text-blue-600 shrink-0" />'), 'ikonet bliver')
ok(view.includes('data-testid="calendar-header-count"'), 'tællingen under overskriften bliver')
ok(view.includes("{upcomingCount} kommende{overdueCount > 0 ? ` · ${overdueCount} overskredet` : ''}"), 'tælleudtrykket er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'overskriften klippes ikke')
ok(!view.slice(0, at).includes('.from('), 'ingen ny forespørgsel')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-page-title-wrap-test')
