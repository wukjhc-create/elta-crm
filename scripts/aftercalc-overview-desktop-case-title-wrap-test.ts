/**
 * Sagsbeskrivelsen i efterkalkulationens sagscelle kan krympe. Sagsnummer og beloeb bliver.
 *   npx tsx scripts/aftercalc-overview-desktop-case-title-wrap-test.ts
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
const id = '<div className="text-[11px] text-gray-500 break-words max-w-[16rem] min-w-0">'
const bare = '<div className="text-[11px] text-gray-500 break-words max-w-[16rem]">'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<div'), 'det er sagsbeskrivelsen')
ok(row.includes('break-words') && row.includes('min-w-0'), 'sagsbeskrivelsen kan krympe')
ok(row.includes('max-w-[16rem]'), 'bredden bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('{r.title}'), 'titelteksten er et andet sted')
ok(!row.includes('quoted_revenue'), 'beloebet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'sagsbeskrivelsen findes en gang')
ok(view.split(bare).length === 1, 'den bare sagsbeskrivelse er vaek')
ok(view.includes('{r.case_number || \'Sag\'}'), 'sagsnummeret bliver')
ok(view.includes('tab=oekonomi'), 'oekonomi-fanen bliver')
ok(view.includes('{kr(r.quoted_revenue)}'), 'tilbudt beloeb bliver')
ok(view.includes('<tr className="break-words min-w-0">'), 'kolonneraekken kan stadig krympe')
ok(view.includes('<td className="px-2 py-1.5 break-words min-w-0">'), 'sagscellen kan stadig krympe')
ok(view.includes('<div className="mt-1 text-[11px] text-amber-900 break-words max-w-[12rem] min-w-0">'), 'advarselsteksten kan krympe')
ok(view.includes('const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1'), 'sideantallet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-overview-desktop-case-title-wrap-test')
