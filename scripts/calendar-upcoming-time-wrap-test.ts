/**
 * Klokken under kommende besigtigelser ombrydes. Navn og booking-sætning er uændret.
 *   npx tsx scripts/calendar-upcoming-time-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { upcomingInspections } from '../src/lib/calendar/agenda'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const kept = upcomingInspections([
  { id: 'past', due_date: '2026-01-01T10:00:00.000Z', status: 'pending' },
  { id: 'done', due_date: '2026-11-02T10:00:00.000Z', status: 'done' },
  { id: 'next', due_date: '2026-11-02T10:00:00.000Z', status: 'pending' },
], '2026-10-18')
ok(kept.map((t) => t.id).join(',') === 'next', 'listen viser kun kommende')

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const heading = view.indexOf('Kommende besigtigelser')
const upcoming = heading >= 0 ? view.slice(heading) : ''
const at = upcoming.indexOf('data-testid="calendar-upcoming-time"')
const row = at >= 0 ? upcoming.slice(at - 180, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'klokken ombrydes')
ok(row.includes('{info.time}'), 'klokken viser det samme tidspunkt')
ok(upcoming.includes('text-sm font-medium text-gray-900 break-words">'), 'kundens navn ombrydes stadig')
ok(upcoming.includes('{task.customer?.company_name || task.title}'), 'kundens navn er uændret')
ok(upcoming.includes('Ingen kommende besigtigelser. Book dem fra kunden eller sagen.'), 'booking-sætningen er uændret')
ok(view.includes('upcomingInspections(tasks, today)'), 'listen bruger den samme funktion')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'klokken klippes ikke')

const before = heading >= 0 ? view.slice(0, heading) : ''
ok(before.includes('<Clock className="w-3.5 h-3.5" />'), 'dagens klokke-ikon bliver')
ok(!before.includes('data-testid="calendar-upcoming-time"'), 'testid ligger kun under kommende')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-upcoming-time-wrap-test')
