/**
 * Den ansvarliges navn eller e-mail på kundens opgave kan krympe. Udtrykket er uændret.
 *   npx tsx scripts/customer-task-assignee-shrink-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'components', 'modules', 'customers', 'customer-tasks.tsx'), 'utf8')
const at = view.indexOf('data-testid="customer-task-assignee"')
const row = at >= 0 ? view.slice(at - 120, at + 140) : ''
ok(row.includes('break-words min-w-0'), 'navnet kan krympe')
ok(row.includes('{task.assigned_profile.full_name || task.assigned_profile.email}'), 'udtrykket er uændret')
ok(view.includes('text-xs text-gray-500 break-words'), 'den eksisterende ombrydning bliver')
ok(view.includes('aria-label="Slet opgave"'), 'slet-navnet bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'navnet klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-task-assignee-shrink-test')
