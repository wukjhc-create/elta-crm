/**
 * Slette-teksten på opgavekortet ombrydes. Udtrykket er uændret.
 *   npx tsx scripts/task-board-delete-wrap-test.ts
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
const id = 'data-testid="task-board-delete"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 180) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes("{isDeleting ? 'Sletter...' : 'Slet'}"), 'udtrykket er uændret')
ok(view.split("{isDeleting ? 'Sletter...' : 'Slet'}").length === 2, 'udtrykket findes en gang')
ok(view.includes('handleDelete()'), 'sletningen bliver')
ok(view.includes('data-testid="task-board-hours"'), 'timetallet bliver')
ok(view.includes('{task.actual_hours}/{task.estimated_hours}t'), 'timeudtrykket bliver')
ok(view.includes('className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"'), 'rediger venter')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  task-board-delete-wrap-test')
