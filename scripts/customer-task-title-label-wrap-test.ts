/**
 * Etiketten "Titel *" på kundens opgaveformular ombrydes. Ordene er uændret.
 *   npx tsx scripts/customer-task-title-label-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TASK_STATUS_CONFIG } from '../src/types/customer-tasks.types'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(TASK_STATUS_CONFIG.pending.label === 'Afventer', 'statusetiketten bliver')

const view = readFileSync(join('src', 'components', 'modules', 'customers', 'customer-tasks.tsx'), 'utf8')
const at = view.indexOf('data-testid="customer-task-label-title"')
const row = at >= 0 ? view.slice(at - 120, at + 60) : ''
ok(row.includes('break-words min-w-0'), 'etiketten ombrydes')
ok(row.includes('>Titel *<'), 'ordene er uændret')
ok(view.includes("due_date: dueDate ? new Date(dueDate).toISOString() : null"), 'forfald sender stadig iso')
ok(view.includes("due_date: dueDate ? new Date(dueDate).toISOString() : undefined"), 'opret sender stadig iso')
ok(view.includes("'Opret'"), 'opret bliver')
ok(view.includes("'Opdater'"), 'opdater bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'etiketten klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-task-title-label-wrap-test')
