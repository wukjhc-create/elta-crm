/**
 * "Sager i visningen" ombrydes. Sidetal og knapper er uændret.
 *   npx tsx scripts/aftercalc-view-count-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'reports', 'aftercalc', 'aftercalc-overview-client.tsx'), 'utf8')
const start = view.indexOf('data-testid="aftercalc-view-count"')
const count = start >= 0 ? view.slice(start - 40, start + 140) : ''
ok(count.includes('data-testid="aftercalc-view-count"'), 'tællingen kan findes')
ok(count.includes('break-words min-w-0" data-testid="aftercalc-view-count">{data.total} sager i visningen. Beregnet på {data.query_ms} ms.'), 'tællingen ombrydes')
ok(!count.includes('truncate'), 'tællingen klippes ikke')

const pagerStart = view.indexOf('data-testid="aftercalc-pager"')
const pagerEnd = view.indexOf('</div>', pagerStart)
const pager = pagerStart >= 0 && pagerEnd > pagerStart ? view.slice(pagerStart, pagerEnd) : ''
ok((pager.match(/min-h-\[44px\]/g) ?? []).length === 2, 'knapperne er stadig 44 px')
ok(pager.includes('setFilter({ page: (data.page ?? 1) - 1 }, true)'), 'forrige side er uændret')
ok(pager.includes('setFilter({ page: (data.page ?? 1) + 1 }, true)'), 'næste side er uændret')
ok(pager.includes('Side {data.page} af {pages}'), 'sidetallet er uændret')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-view-count-wrap-test')
