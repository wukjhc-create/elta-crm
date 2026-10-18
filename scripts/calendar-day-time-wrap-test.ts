/**
 * Klokken på den valgte dag ombrydes. Adresse og statusmærke er uændret.
 *   npx tsx scripts/calendar-day-time-wrap-test.ts
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
  { id: 'next', due_date: '2026-11-02T10:00:00.000Z', status: 'pending' },
], '2026-10-18')
ok(kept.length === 1 && kept[0].id === 'next', 'kommende listen er uændret')

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const heading = view.indexOf('Kommende besigtigelser')
const day = heading >= 0 ? view.slice(0, heading) : ''
const at = day.indexOf('data-testid="calendar-day-time"')
const row = at >= 0 ? day.slice(at - 220, at + 70) : ''
ok(row.includes('break-words min-w-0'), 'klokken ombrydes')
ok(row.includes('{info.time}'), 'klokken viser det samme tidspunkt')
ok(row.includes('<Clock className="w-3.5 h-3.5" />'), 'ikonet er uændret')
ok(day.includes('break-words min-w-0">{info.address}'), 'adressen er uændret')
ok(day.includes('shrink-0 px-2 py-0.5 text-xs font-medium rounded-full'), 'statusmærket er uændret')
ok(day.includes('{statusConf.label}'), 'statusordet er uændret')
ok(!day.includes('data-testid="calendar-upcoming-time"'), 'kommende-testid ligger ikke her')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'klokken klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-day-time-wrap-test')
