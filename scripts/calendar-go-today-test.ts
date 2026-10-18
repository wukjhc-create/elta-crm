/**
 * Knappen "I dag" er mindst 44 px høj. Teksten og goToToday er uændret.
 *   npx tsx scripts/calendar-go-today-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="calendar-go-today"')
const row = at >= 0 ? view.slice(at - 220, at + 60) : ''
ok(row.includes('min-h-[44px]'), 'knappen er høj nok')
ok(row.includes('onClick={goToToday}'), 'handlingen er uændret')
ok(row.includes('I dag'), 'teksten er uændret')
ok(view.includes('data-testid="calendar-page-title">Kalender — Besigtigelser'), 'overskriften er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'knappen klippes ikke')
ok(!view.slice(0, at).includes('.from('), 'ingen ny forespørgsel')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-go-today-test')
