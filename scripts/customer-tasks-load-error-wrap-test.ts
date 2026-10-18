/**
 * Fejlen på kundens opgaver ombrydes. loadError er uændret.
 *   npx tsx scripts/customer-tasks-load-error-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'components', 'modules', 'customers', 'customer-tasks.tsx'), 'utf8')
const at = view.indexOf('data-testid="customer-tasks-load-error"')
const row = at >= 0 ? view.slice(at - 90, at + 70) : ''
ok(row.includes('break-words min-w-0'), 'fejlen ombrydes')
ok(row.includes('{loadError}'), 'teksten kommer fra loadError')
ok(view.includes("setLoadError('Kunne ikke hente opgaver. Det tælles ikke som ingen opgaver.')"), 'sætningen er uændret')
ok(view.includes('loadError && tasks.length === 0'), 'fejlen skjuler stadig den tomme liste')
ok(view.includes('data-testid="customer-tasks-empty"'), 'den tomme tilstand bliver')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'fejlen klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  customer-tasks-load-error-wrap-test')
