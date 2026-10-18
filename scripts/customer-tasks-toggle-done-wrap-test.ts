/**
 * Knappen Vis/Skjul udførte på kundens opgaver ombrydes. Ordene og tællingen er uændret.
 *   npx tsx scripts/customer-tasks-toggle-done-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'components', 'modules', 'customers', 'customer-tasks.tsx'), 'utf8')
const at = view.indexOf('data-testid="customer-tasks-toggle-done"')
const row = at >= 0 ? view.slice(at - 240, at + 160) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes("{showDone ? 'Skjul' : 'Vis'} udførte ({doneTasks.length})"), 'ordene og tællingen er uændret')
ok(row.includes('setShowDone(!showDone)'), 'knappen skifter stadig visningen')
ok(view.includes('data-testid="customer-tasks-no-open"'), 'ingen åbne bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'knappen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-tasks-toggle-done-wrap-test')
