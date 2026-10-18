/**
 * "Bekræftet af kunden" på den valgte dag ombrydes. Betingelsen er uændret.
 *   npx tsx scripts/calendar-day-confirmed-wrap-test.ts
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
const at = day.indexOf('data-testid="calendar-day-confirmed"')
const row = at >= 0 ? day.slice(at - 360, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'teksten ombrydes')
ok(row.includes('Bekræftet af kunden'), 'teksten er uændret')
ok(row.includes("task.status === 'in_progress' && task.description?.includes('BEKRÆFTET')"), 'betingelsen er uændret')
ok(row.includes('<CheckCircle className="w-3.5 h-3.5" />'), 'ikonet er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'teksten klippes ikke')
ok(day.includes('leading-tight px-1 py-0.5 rounded mb-0.5 truncate'), 'dagbrikkerne afkortes stadig')
ok(day.includes("const isConfirmed = task.status === 'in_progress' && task.description?.includes('BEKRÆFTET')"), 'månedens bekræftelse er uændret')
ok(day.includes('break-words min-w-0">{info.address}'), 'besøgsadressen er uændret')
ok(!day.includes('.from('), 'ingen ny forespørgsel')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-day-confirmed-wrap-test')
