/**
 * Etiketterne Beskrivelse, Prioritet, Status, Ansvarlig, Forfaldsdato og Påmindelse ombrydes.
 * Ordene er uændret.
 *   npx tsx scripts/customer-task-field-labels-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TASK_PRIORITY_CONFIG } from '../src/types/customer-tasks.types'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(TASK_PRIORITY_CONFIG.high.label === 'Høj', 'prioritetetiketten bliver')

const view = readFileSync(join('src', 'components', 'modules', 'customers', 'customer-tasks.tsx'), 'utf8')
const labels: Array<[string, string]> = [
  ['customer-task-label-description', '>Beskrivelse<'],
  ['customer-task-label-priority', '>Prioritet<'],
  ['customer-task-label-status', '>Status<'],
  ['customer-task-label-assignee', '>Ansvarlig<'],
  ['customer-task-label-due', '>Forfaldsdato<'],
  ['customer-task-label-reminder', '>Påmindelse<'],
]
for (const [id, word] of labels) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 100, at + 80) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes(word), `${id} er uændret`)
  ok(!row.includes(' truncate') && !row.includes('truncate '), `${id} klippes ikke`)
}
ok(view.includes('data-testid="customer-task-label-title"'), 'titel-etiketten bliver')
ok(view.includes('grid-cols-1 sm:grid-cols-2 gap-4'), 'felter stables stadig')
ok(view.includes("due_date: dueDate ? new Date(dueDate).toISOString() : null"), 'forfald sender stadig iso')
ok(view.includes("due_date: dueDate ? new Date(dueDate).toISOString() : undefined"), 'opret sender stadig iso')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-task-field-labels-wrap-test')
