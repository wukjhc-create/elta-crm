/**
 * Kalenderens "Ansvarlige kunne ikke hentes" ombrydes. Sætningen er uændret.
 *   npx tsx scripts/calendar-assignee-names-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="calendar-assignee-names-error"')
const row = start >= 0 ? view.slice(start - 80, start + 180) : ''
ok(row.includes('break-words min-w-0'), 'navnefejlen ombrydes')
ok(row.includes('Ansvarlige kunne ikke hentes. Det tælles ikke som ikke tildelt.'), 'sætningen er uændret')
ok(!row.includes('truncate'), 'navnefejlen klippes ikke')
ok(view.indexOf('data-testid="calendar-tasks-load-error"') < start, 'aftalefejlen kommer først')
ok(view.includes('{tasksError}. Det tælles ikke som ingen aftaler.'), 'aftalefejlen er uændret')
ok(view.includes('data-testid="calendar-day-reminder-count"'), 'påmindelsestællingen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-assignee-names-wrap-test')
