/**
 * Sagens opgavefejl "Ansvarlige kunne ikke hentes" ombrydes. Sætningen er uændret.
 *   npx tsx scripts/case-task-assignee-error-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'order-tasks-tab.tsx'), 'utf8')
const at = view.indexOf('data-testid="case-task-assignee-names-error"')
const row = at >= 0 ? view.slice(at - 70, at + 140) : ''
ok(row.includes('break-words min-w-0'), 'fejlen ombrydes')
ok(row.includes('Ansvarlige kunne ikke hentes. Det tælles ikke som ikke tildelt.'), 'sætningen er uændret')
ok(view.includes('setTasks(result.tasks)'), 'opgaverne beholdes')
ok(!view.includes('setTasks([])'), 'listen nulstilles ikke')
ok(view.includes('data-testid="case-tasks-open-count"'), 'udestår-tællingen bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'fejlen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  case-task-assignee-error-wrap-test')
