/**
 * Knappen Naeste paa efterkalkulation kan krympe. Forrige og 44 px bliver.
 *   npx tsx scripts/aftercalc-overview-next-button-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const view = readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const id = '<button type="button" disabled={(data.page ?? 1) >= pages} onClick={() => setFilter({ page: (data.page ?? 1) + 1 }, true)} className="min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40 break-words min-w-0">Næste</button>'
const bare = '<button type="button" disabled={(data.page ?? 1) >= pages} onClick={() => setFilter({ page: (data.page ?? 1) + 1 }, true)} className="min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Næste</button>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<button'), 'det er Naeste')
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(row.includes('min-h-[44px]'), '44 px bliver')
ok(row.includes('>Næste</button>'), 'teksten bliver')
ok(row.includes('setFilter({ page: (data.page ?? 1) + 1 }, true)'), 'naeste side bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('Forrige'), 'Forrige er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(bare).length === 1, 'den bare knap er vaek')
ok(view.includes('className="min-h-[44px] px-2 py-1 rounded border border-gray-300 disabled:opacity-40 break-words min-w-0">Forrige</button>'), 'Forrige kan krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')
ok(view.includes('setFilter({ page: (data.page ?? 1) - 1 }, true)'), 'forrige side bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-next-button-wrap-test')
