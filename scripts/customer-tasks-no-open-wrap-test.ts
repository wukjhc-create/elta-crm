/**
 * "Ingen åbne opgaver" på kundekortet ombrydes. Sætningen er uændret.
 *   npx tsx scripts/customer-tasks-no-open-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'components', 'modules', 'customers', 'customer-tasks.tsx'), 'utf8')
const at = view.indexOf('data-testid="customer-tasks-no-open"')
const row = at >= 0 ? view.slice(at - 90, at + 110) : ''
ok(row.includes('break-words min-w-0'), 'sætningen ombrydes')
ok(row.includes('>Ingen åbne opgaver. Udførte ligger nedenfor.<'), 'sætningen er uændret')
ok(view.includes('data-testid="customer-tasks-empty-title"'), 'den tomme overskrift bliver')
ok(view.includes('activeTasks.length === 0 && doneTasks.length === 0'), 'helt tom liste er stadig en anden tilstand')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'sætningen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-tasks-no-open-wrap-test')
