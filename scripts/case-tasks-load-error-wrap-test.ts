/**
 * Fejlen på sagens opgaver ombrydes. Sætningen er uændret.
 *   npx tsx scripts/case-tasks-load-error-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'order-tasks-tab.tsx'), 'utf8')
const id = 'data-testid="case-tasks-load-error"'
const marks = view.split(id).length - 1
ok(marks === 2, 'begge hentefejl kan findes')
let from = 0
for (let i = 0; i < marks; i++) {
  const at = view.indexOf(id, from)
  const row = at >= 0 ? view.slice(at - 140, at + 55) : ''
  ok(row.includes('break-words min-w-0'), `fejl ${i + 1} ombrydes`)
  ok(row.includes('{error}'), `fejl ${i + 1} viser den samme tekst`)
  ok(!row.includes(' truncate') && !row.includes('truncate '), `fejl ${i + 1} klippes ikke`)
  from = at + id.length
}
ok(view.includes("setError('Kunne ikke hente opgaver. Det tælles ikke som ingen opgaver.')"), 'sætningen er uændret')
ok(view.includes('error && tasks.length === 0'), 'tom liste skjules stadig ved fejl')
ok(view.includes('{error && <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">{error}</div>}'), 'fejlen over listen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  case-tasks-load-error-wrap-test')
