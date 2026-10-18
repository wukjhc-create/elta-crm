/**
 * "Åbn rutevejledning" ombrydes. Kortlinket og besøgsadressen er uændret.
 *   npx tsx scripts/calendar-day-route-wrap-test.ts
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
const at = day.indexOf('data-testid="calendar-day-route"')
const row = at >= 0 ? day.slice(at - 560, at + 200) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes('href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(info.address)}`}'), 'kortlinket er uændret')
ok(row.includes('target="_blank"'), 'linket åbner stadig i et nyt vindue')
ok(row.includes('rel="noopener noreferrer"'), 'linket er stadig noreferrer')
ok(row.includes('Åbn rutevejledning'), 'teksten er uændret')
ok(day.includes('break-words min-w-0">{info.address}'), 'besøgsadressen er uændret')
ok(day.includes('{info.address &&'), 'knappen vises kun når adressen findes')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'knappen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-day-route-wrap-test')
