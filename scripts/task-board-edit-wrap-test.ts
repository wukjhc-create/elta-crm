/**
 * Rediger-teksten på opgavekortet ombrydes. Teksten er uændret.
 *   npx tsx scripts/task-board-edit-wrap-test.ts
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
const id = 'data-testid="task-board-edit"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 160) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes('Rediger'), 'teksten er uændret')
ok(view.split('Rediger').length === 2, 'teksten findes en gang')
ok(view.includes('onEdit(task)'), 'redigeringen bliver')
ok(view.includes('data-testid="task-board-delete"'), 'sletningen bliver')
ok(view.includes("{isDeleting ? 'Sletter...' : 'Slet'}"), 'sletteudtrykket bliver')
ok(view.includes('data-testid="task-board-hours"'), 'timetallet bliver')
ok(view.includes('{task.actual_hours}/{task.estimated_hours}t'), 'timeudtrykket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  task-board-edit-wrap-test')
