/**
 * Ugedagsnavnene i kalenderen ombrydes. Navnene er uændret.
 *   npx tsx scripts/calendar-weekday-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const headers = view.slice(view.indexOf('Weekday headers'), view.indexOf('Days grid'))
const at = headers.indexOf('data-testid="calendar-weekday-name"')
const row = at >= 0 ? headers.slice(at - 160, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'ugedagen ombrydes')
ok(row.includes('{name}'), 'navnet kommer fra listen')
ok(view.includes("const WEEKDAY_NAMES = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']"), 'navnene er uændret')
ok(headers.includes('grid grid-cols-7'), 'syv kolonner bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'ugedagen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-weekday-wrap-test')
