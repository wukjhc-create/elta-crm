/**
 * Efterkalk-oversigtens "Henter…" ombrydes. Sætningen er uændret.
 *   npx tsx scripts/aftercalc-overview-loading-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="aftercalc-overview-loading"')
const row = start >= 0 ? view.slice(start - 80, start + 200) : ''
ok(row.includes('data-testid="aftercalc-overview-loading"'), 'venteteksten kan findes')
ok(row.includes('break-words min-w-0'), 'venteteksten ombrydes')
ok(row.includes('> Henter…</p>'), 'sætningen er uændret')
ok(row.includes('<Loader2 className="w-4 h-4 animate-spin break-words min-w-0" data-testid="aftercalc-overview-loading-spinner" />'), 'spinneren kan krympe')
ok(!row.includes('truncate'), 'venteteksten klippes ikke')
ok(view.includes('{loading && !data &&'), 'den vises kun mens der hentes')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet er uændret')
ok(view.includes('min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Forrige'), 'Forrige er høj nok')
ok(view.includes('data-testid="aftercalc-overview-error"'), 'fejlteksten er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-loading-wrap-test')
