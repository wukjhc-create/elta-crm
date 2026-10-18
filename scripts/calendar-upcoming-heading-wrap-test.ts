/**
 * Overskriften "Kommende besigtigelser" ombrydes. Ordene er uændret.
 *   npx tsx scripts/calendar-upcoming-heading-wrap-test.ts
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
const at = view.indexOf('data-testid="calendar-upcoming-heading"')
const row = at >= 0 ? view.slice(at - 90, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(row.includes('>Kommende besigtigelser<'), 'ordene er uændret')
ok(view.includes('data-testid="calendar-upcoming-empty"'), 'den tomme liste bliver')
ok(view.includes('Ingen kommende besigtigelser. Book dem fra kunden eller sagen.'), 'den tomme sætning er uændret')
ok(view.includes('upcomingInspections(tasks, today)'), 'listen kommer fra den shippede funktion')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'overskriften klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-upcoming-heading-wrap-test')
