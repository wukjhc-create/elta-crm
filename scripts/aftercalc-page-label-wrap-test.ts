/**
 * Sidetallet ved Forrige/Næste ombrydes. Sidetallet er uændret.
 *   npx tsx scripts/aftercalc-page-label-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="aftercalc-pager"')
const end = view.indexOf('</div>', start)
const pager = start >= 0 && end > start ? view.slice(start, end) : ''
ok(pager.includes('data-testid="aftercalc-page-label"'), 'sidetallet kan findes')
ok(pager.includes('break-words min-w-0" data-testid="aftercalc-page-label">Side {data.page} af {pages}'), 'sidetallet ombrydes')
ok(pager.includes('setFilter({ page: (data.page ?? 1) - 1 }, true)'), 'forrige side er uændret')
ok(pager.includes('setFilter({ page: (data.page ?? 1) + 1 }, true)'), 'næste side er uændret')
ok((pager.match(/min-h-\[44px\]/g) ?? []).length === 2, 'knappernes højde er uændret')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-page-label-wrap-test')
