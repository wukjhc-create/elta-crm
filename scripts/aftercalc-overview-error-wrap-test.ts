/**
 * Efterkalk-oversigtens fejltekst ombrydes. Udtrykket {error} er uændret.
 *   npx tsx scripts/aftercalc-overview-error-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="aftercalc-overview-error"')
const err = start >= 0 ? view.slice(start - 90, start + 80) : ''
ok(err.includes('data-testid="aftercalc-overview-error"'), 'fejlteksten kan findes')
ok(err.includes('break-words min-w-0'), 'fejlteksten ombrydes')
ok(err.includes('>{error}</p>'), 'fejludtrykket er uændret')
ok(!err.includes('truncate'), 'fejlteksten klippes ikke')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet er uændret')
ok(view.includes('min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Forrige'), 'Forrige er høj nok')
ok(view.includes('min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Næste'), 'Næste er høj nok')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-error-wrap-test')
