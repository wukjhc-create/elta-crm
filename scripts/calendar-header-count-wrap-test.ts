/**
 * "kommende / overskredet" i kalenderens overskrift ombrydes. Tællingen er uændret.
 *   npx tsx scripts/calendar-header-count-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="calendar-header-count"')
const row = at >= 0 ? view.slice(at - 120, at + 180) : ''
ok(row.includes('break-words min-w-0'), 'tællingen ombrydes')
ok(row.includes("{upcomingCount} kommende{overdueCount > 0 ? ` · ${overdueCount} overskredet` : ''}"), 'tællingen er uændret')
ok(view.includes('const upcomingCount = upcomingTasks.length'), 'kommende tælles stadig fra listen')
ok(view.includes("const overdueCount = tasks.filter((t) => t.due_date && dayOf(t.due_date) < today && t.status !== 'done').length"), 'overskredet tælles stadig')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'tællingen klippes ikke')
ok(!view.slice(0, at).includes('.from('), 'ingen ny forespørgsel før tællingen')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-header-count-wrap-test')
