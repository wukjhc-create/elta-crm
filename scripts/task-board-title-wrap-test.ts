/**
 * Opgavetitlen på opgavebrættet ombrydes. Teksten er uændret.
 *   npx tsx scripts/task-board-title-wrap-test.ts
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
const id = 'data-testid="task-board-title"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'titlen ombrydes')
ok(row.includes('>{task.title}'), 'teksten er uændret')
ok(view.includes('data-testid="task-board-description"'), 'beskrivelsen bliver')
ok(view.includes('text-xs text-muted-foreground mt-2 break-words min-w-0" data-testid="task-board-description"'), 'beskrivelsen ombrydes stadig')
ok(view.includes('updateTaskStatus'), 'statusskiftet bliver')
ok(view.includes('deleteTask'), 'slet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  task-board-title-wrap-test')
