/**
 * Status- og prioritetmærket på sagens opgaver ombrydes. Etiketterne er uændret.
 *   npx tsx scripts/case-task-badges-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TASK_PRIORITY_CONFIG, TASK_STATUS_CONFIG } from '../src/types/customer-tasks.types'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(TASK_STATUS_CONFIG.pending.label === 'Afventer', 'afventer bliver')
ok(TASK_STATUS_CONFIG.in_progress.label === 'I gang', 'i gang bliver')
ok(TASK_STATUS_CONFIG.done.label === 'Udført', 'udført bliver')
ok(TASK_PRIORITY_CONFIG.low.label === 'Lav', 'lav bliver')
ok(TASK_PRIORITY_CONFIG.normal.label === 'Normal', 'normal bliver')
ok(TASK_PRIORITY_CONFIG.high.label === 'Høj', 'høj bliver')
ok(TASK_PRIORITY_CONFIG.urgent.label === 'Akut', 'akut bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'order-tasks-tab.tsx'), 'utf8')
const statusAt = view.indexOf('data-testid="case-task-status-badge"')
const statusRow = statusAt >= 0 ? view.slice(statusAt - 160, statusAt + 80) : ''
ok(statusRow.includes('break-words min-w-0'), 'status ombrydes')
ok(statusRow.includes('{status.label}'), 'statusetiketten er uændret')
ok(!statusRow.includes(' truncate') && !statusRow.includes('truncate '), 'status klippes ikke')

const prioAt = view.indexOf('data-testid="case-task-priority-badge"')
const prioRow = prioAt >= 0 ? view.slice(prioAt - 160, prioAt + 80) : ''
ok(prioRow.includes('break-words min-w-0'), 'prioritet ombrydes')
ok(prioRow.includes('{prio.label}'), 'prioritetetiketten er uændret')
ok(!prioRow.includes(' truncate') && !prioRow.includes('truncate '), 'prioritet klippes ikke')
ok(view.includes('{error && <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">{error}</div>}'), 'fejl over listen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  case-task-badges-wrap-test')
