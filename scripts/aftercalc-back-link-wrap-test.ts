/**
 * "Tilbage til rapporter" ombrydes. Adressen er uændret.
 *   npx tsx scripts/aftercalc-back-link-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="aftercalc-back-link"')
const link = start >= 0 ? view.slice(start - 140, start + 80) : ''
ok(link.includes('data-testid="aftercalc-back-link"'), 'linket kan findes')
ok(link.includes('href="/dashboard/reports"'), 'adressen er uændret')
ok(link.includes('break-words min-w-0'), 'linket ombrydes')
ok(link.includes('>Tilbage til rapporter</Link>'), 'teksten er uændret')
ok(!link.includes('shrink-0'), 'linket kan blive smallere')
ok(!link.includes('truncate'), 'linket klippes ikke')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet er uændret')
ok(view.includes('min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40 break-words min-w-0">Forrige'), 'Forrige er høj nok')
ok(view.includes('data-testid="aftercalc-overview-error"'), 'fejlteksten er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-back-link-wrap-test')
