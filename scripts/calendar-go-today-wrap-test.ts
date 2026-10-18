/**
 * Knappen "I dag" på kalenderen ombrydes. Ordene og min-h-[44px] er uændret.
 *   npx tsx scripts/calendar-go-today-wrap-test.ts
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
const at = view.indexOf('data-testid="calendar-go-today"')
const row = at >= 0 ? view.slice(at - 260, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes('min-h-[44px]'), 'hoejden er uændret')
ok(row.includes('onClick={goToToday}'), 'handlingen er uændret')
ok(row.includes('I dag'), 'ordene er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'knappen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-go-today-wrap-test')
