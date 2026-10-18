/**
 * Teksten "Ingen forfaldsdato" på kundens opgave ombrydes. Ordene er uændret.
 *   npx tsx scripts/customer-task-no-due-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'components', 'modules', 'customers', 'customer-tasks.tsx'), 'utf8')
const at = view.indexOf('data-testid="customer-task-no-due"')
const row = at >= 0 ? view.slice(at - 120, at + 70) : ''
ok(row.includes('break-words min-w-0'), 'teksten ombrydes')
ok(row.includes('>Ingen forfaldsdato<'), 'ordene er uændret')
ok(view.includes("timeZone: 'Europe/Copenhagen'"), 'forfaldsdatoen bruger stadig dansk tid')
ok(view.includes('data-testid="customer-task-due"'), 'datoen med forfald bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'teksten klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-task-no-due-wrap-test')
