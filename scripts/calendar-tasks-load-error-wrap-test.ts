/**
 * Kalenderens fejl ved hentning ombrydes. Den tælles ikke som ingen aftaler.
 *   npx tsx scripts/calendar-tasks-load-error-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="calendar-tasks-load-error"')
const row = start >= 0 ? view.slice(start - 80, start + 160) : ''
ok(row.includes('break-words min-w-0'), 'aftalefejlen ombrydes')
ok(row.includes('{tasksError}. Det tælles ikke som ingen aftaler.'), 'sætningen er uændret')
ok(!row.includes('truncate'), 'aftalefejlen klippes ikke')
ok(view.includes('data-testid="calendar-assignee-names-error"'), 'navnefejlen er uændret')
ok(view.includes('Ansvarlige kunne ikke hentes. Det tælles ikke som ikke tildelt.'), 'navnesætningen er uændret')
ok(start < view.indexOf('data-testid="calendar-assignee-names-error"'), 'aftalefejlen kommer først')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-tasks-load-error-wrap-test')
