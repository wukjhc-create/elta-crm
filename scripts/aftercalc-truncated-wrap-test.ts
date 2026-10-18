/**
 * "Viser de nyeste sager" ombrydes. Sagstallet er uændret.
 *   npx tsx scripts/aftercalc-truncated-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="aftercalc-truncated"')
const row = start >= 0 ? view.slice(start - 90, start + 220) : ''
ok(row.includes('break-words min-w-0'), 'noticen ombrydes')
ok(row.includes('Viser de {data.cases_considered} nyeste sager i filtret. Ældre sager er ikke beregnet.'), 'sætningen er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'noticen klippes ikke')
ok(view.includes('data-testid="aftercalc-quality-summary"'), 'kvalitetstællingen er uændret')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet er uændret')
ok(view.includes('data-testid="aftercalc-assignees-error"'), 'medarbejderfejlen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-truncated-wrap-test')
