/**
 * Linket "Gå til kundekort" ombrydes. Adressen er uændret.
 *   npx tsx scripts/calendar-day-customer-link-wrap-test.ts
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
const at = day.indexOf('data-testid="calendar-day-customer-link"')
const row = at >= 0 ? day.slice(at - 280, at + 160) : ''
ok(row.includes('break-words min-w-0'), 'linket ombrydes')
ok(row.includes('href={`/dashboard/customers/${task.customer.id}`}'), 'adressen er uændret')
ok(row.includes('Gå til kundekort →'), 'linkteksten er uændret')
ok(row.includes('{task.customer &&'), 'linket vises kun når dagen har en kunde')
ok(day.includes('break-words min-w-0">{info.address}'), 'besøgsadressen er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'linket klippes ikke')
ok(!day.includes('.from('), 'ingen ny forespørgsel')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-day-customer-link-wrap-test')
