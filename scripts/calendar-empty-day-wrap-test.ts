/**
 * Den tomme dags sætning ombrydes. "Klik på en dag" er uændret.
 *   npx tsx scripts/calendar-empty-day-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'calendar', 'calendar-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="calendar-empty-day"')
const empty = start >= 0 ? view.slice(start - 80, start + 180) : ''
ok(empty.includes('data-testid="calendar-empty-day"'), 'den tomme dag kan findes')
ok(empty.includes('break-words min-w-0'), 'den tomme dag ombrydes')
ok(empty.includes('Ingen besigtigelser eller opkald denne dag'), 'teksten er uændret')
ok(!empty.includes('Klik på en dag'), 'opfordringen er ikke denne tekst')
ok(view.includes('data-testid="calendar-pick-day"'), 'opfordringen er uændret')
ok(view.includes('leading-tight px-1 py-0.5 rounded mb-0.5 truncate'), 'dagkortet er stadig afkortet')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  calendar-empty-day-wrap-test')
