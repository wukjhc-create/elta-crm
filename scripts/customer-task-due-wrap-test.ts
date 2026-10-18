/**
 * Forfaldsdatoen på kundens opgave ombrydes. Dato-udtrykket med Europe/Copenhagen er uændret.
 *   npx tsx scripts/customer-task-due-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'components', 'modules', 'customers', 'customer-tasks.tsx'), 'utf8')
const at = view.indexOf('data-testid="customer-task-due"')
const row = at >= 0 ? view.slice(at - 180, at + 360) : ''
const expr = "new Date(task.due_date).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'short', year: 'numeric' })"
ok(row.includes('break-words min-w-0'), 'datoen ombrydes')
ok(row.includes(expr), 'dato-udtrykket er uændret')
ok(row.includes("timeZone: 'Europe/Copenhagen'"), 'dansk tid bliver')
ok(view.includes('Ingen forfaldsdato'), 'den tomme dato bliver')
ok(view.includes('data-testid="customer-task-status-badge"'), 'statusmærket bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'datoen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-task-due-wrap-test')
