/**
 * Mærket "opstart" på sagens opgaver ombrydes. Ordet er uændret.
 *   npx tsx scripts/case-task-startup-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'order-tasks-tab.tsx'), 'utf8')
const at = view.indexOf('data-testid="case-task-startup-mark"')
const row = at >= 0 ? view.slice(at - 240, at + 140) : ''
ok(row.includes('break-words min-w-0'), 'mærket ombrydes')
ok(row.includes('/> opstart'), 'ordet er uændret')
ok(row.includes('t.auto_generated'), 'mærket vises kun på automatiske opgaver')
ok(view.includes('Når en sag oprettes fra et tilbud, får den automatisk en opstartstjekliste her.'), 'den tomme forklaring er uændret')
ok(view.includes('data-testid="case-task-status-badge"'), 'statusmærket bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'mærket klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  case-task-startup-wrap-test')
