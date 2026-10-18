/**
 * Kundens "Medarbejdere kunne ikke hentes" ombrydes. Sætningen er uændret.
 *   npx tsx scripts/customer-task-profiles-error-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'components', 'modules', 'customers', 'customer-tasks.tsx'), 'utf8')
const at = view.indexOf('data-testid="customer-task-profiles-error"')
const row = at >= 0 ? view.slice(at - 80, at + 70) : ''
ok(row.includes('break-words min-w-0'), 'fejlen ombrydes')
ok(row.includes('{profilesError}'), 'teksten kommer fra den samme fejl')
ok(view.includes("setProfilesError('Medarbejdere kunne ikke hentes. Det tælles ikke som ingen.')"), 'sætningen er uændret')
ok(view.includes('data-testid="customer-task-assignee-names-error"'), 'navnefejlen bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'fejlen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-task-profiles-error-wrap-test')
