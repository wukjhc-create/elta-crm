/**
 * Efterkalk-oversigtens medarbejderfejl ombrydes. Sætningen er uændret.
 *   npx tsx scripts/aftercalc-assignees-error-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="aftercalc-assignees-error"')
const row = start >= 0 ? view.slice(start - 80, start + 80) : ''
ok(row.includes('break-words min-w-0'), 'fejlen ombrydes')
ok(row.includes('>{assigneesError}</p>'), 'fejludtrykket er uændret')
ok(!row.includes('truncate'), 'fejlen klippes ikke')
ok(view.includes('Ansvarlige kunne ikke hentes. Det tælles ikke som ingen.'), 'sætningen er uændret')
ok(!view.includes('setAssignees([])'), 'en fejl rydder ikke listen')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet er uændret')
ok(view.includes('min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Forrige'), 'Forrige er høj nok')
ok(view.includes('data-testid="aftercalc-overview-error"'), 'sagsfejlen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-assignees-error-wrap-test')
