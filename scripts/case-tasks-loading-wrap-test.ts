/**
 * "Henter opgaver…" på sagen ombrydes. Sætningen er uændret.
 *   npx tsx scripts/case-tasks-loading-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'order-tasks-tab.tsx'), 'utf8')
const at = view.indexOf('data-testid="case-tasks-loading"')
const row = at >= 0 ? view.slice(at - 100, at + 50) : ''
ok(row.includes('break-words min-w-0'), 'teksten ombrydes')
ok(row.includes('>Henter opgaver…<'), 'sætningen er uændret')
ok(view.includes('tasks === null && !error'), 'hentning vises kun før svar')
ok(view.includes('data-testid="case-tasks-load-error"'), 'fejlen bliver')
ok(view.includes("setError('Kunne ikke hente opgaver. Det tælles ikke som ingen opgaver.')"), 'fejlteksten er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'teksten klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  case-tasks-loading-wrap-test')
