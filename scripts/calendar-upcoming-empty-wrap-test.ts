/**
 * "Ingen kommende besigtigelser" ombrydes. Booking-sætningen er uændret.
 *   npx tsx scripts/calendar-upcoming-empty-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="calendar-upcoming-empty"')
const empty = start >= 0 ? view.slice(start - 90, start + 160) : ''
ok(empty.includes('data-testid="calendar-upcoming-empty"'), 'den tomme kommende liste kan findes')
ok(empty.includes('break-words min-w-0'), 'den tomme kommende liste ombrydes')
ok(empty.includes('Ingen kommende besigtigelser. Book dem fra kunden eller sagen.'), 'booking-sætningen er uændret')
ok(!empty.includes('truncate'), 'den tomme kommende liste klippes ikke')
ok(view.includes('leading-tight px-1 py-0.5 rounded mb-0.5 truncate'), 'dagkortet er stadig afkortet')
ok(view.includes('data-testid="calendar-empty-day"'), 'den tomme dag er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-upcoming-empty-wrap-test')
