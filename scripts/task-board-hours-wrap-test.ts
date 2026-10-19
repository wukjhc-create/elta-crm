/**
 * Timetallet på opgavekortet ombrydes. Udtrykket er uændret.
 *   npx tsx scripts/task-board-hours-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync('src/components/modules/projects/task-board.tsx', 'utf8')
const id = 'data-testid="task-board-hours"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 180, at + 140) : ''
ok(row.includes('break-words min-w-0'), 'timetallet ombrydes')
ok(row.includes('{task.actual_hours}/{task.estimated_hours}t'), 'udtrykket er uændret')
ok(view.includes('data-testid="task-board-due-date"'), 'forfaldsdatoen bliver')
ok(view.includes('{formatDate(task.due_date)}'), 'datokaldet bliver')
ok(view.includes('data-testid="task-board-title"'), 'titlen bliver')
ok(view.includes('updateTaskStatus'), 'statusskiftet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  task-board-hours-wrap-test')
