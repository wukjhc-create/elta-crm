/**
 * Matchlinjen paa fakturakontrollens mobilkort kan krympe. Beloebene bliver.
 *   npx tsx scripts/invoice-control-match-line-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/incoming-invoices/[id]/invoice-control-panel.tsx', 'utf8')
const id = '<p className="mt-1 text-gray-600 break-all break-words min-w-0">'
const bare = '<p className="mt-1 text-gray-600 break-all">'
const marker = 'data-testid="invoice-control-mobile-expected"'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.lastIndexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<p'), 'det er en matchlinje')
ok(row.includes('break-words min-w-0'), 'matchlinjen kan krympe')
ok(row.includes('break-all'), 'lange varenumre kan stadig brydes')
ok(row.includes('mt-1 text-gray-600'), 'afstanden bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'linjen staar foer den forventede pris')
ok(between.indexOf(id, 1) === -1, 'det er den naermeste linje')
ok(between.includes(marker), 'det er mobilkortet')
ok(between.includes("(l.reason ?? 'ingen')"), 'aarsagen bliver')
ok(between.includes('m?.method'), 'metoden bliver')
ok(between.includes('m.productSku'), 'varenummeret bliver')
ok(view.split(id).length === 2, 'linjen findes en gang')
ok(view.split(bare).length === 1, 'den bare linje er vaek')
ok(!view.includes(bare), 'den bare linje er vaek')
ok(view.includes('<tr className="text-left text-gray-500 break-words min-w-0">'), 'kolonneraekken kan stadig krympe')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')
ok(view.includes('Det tælles ikke som 0 kr.'), 'nul-linjen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-match-line-wrap-test')
