/**
 * Daekningstallet paa fakturakontrol kan krympe. Tallene bliver.
 *   npx tsx scripts/invoice-control-coverage-wrap-test.ts
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
const id = '<div className="font-medium break-words min-w-0">{res.control.controlledLines} / {res.control.totalLines} ({res.control.coveragePct} %)</div>'
const bare = '<div className="font-medium break-words">{res.control.controlledLines} / {res.control.totalLines} ({res.control.coveragePct} %)</div>'
const marker = 'data-testid="invoice-control-label-controlled"'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.indexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt <= at ? view.slice(markerAt, at + id.length) : ''
ok(row.startsWith('<div'), 'det er daekningstallet')
ok(row.includes('break-words min-w-0'), 'tallet kan krympe')
ok(row.includes('{res.control.controlledLines}'), 'kontrollerede linjer bliver')
ok(row.includes('{res.control.totalLines}'), 'linjetotalen bliver')
ok(row.includes('{res.control.coveragePct}'), 'daekningsprocenten bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(marker), 'etiketten staar foer tallet')
ok(between.indexOf(id) === between.lastIndexOf(id), 'det er det naermeste tal')
ok(between.includes(id), 'det er daekningstallet')
ok(view.indexOf(id) === view.lastIndexOf(id), 'tallet findes en gang')
ok(view.split(id).length === 2, 'tallet findes en gang')
ok(view.split(bare).length === 1, 'det bare tal er vaek')
ok(!view.includes(bare), 'det bare tal er vaek')
ok(view.includes('font-medium break-words ${'), 'overprisens klasse bliver')
ok(view.includes('break-words min-w-0">{res.hasSupplier'), 'leverandoerteksten kan stadig krympe')
ok(view.includes('{review.freight} fragt, {review.fee} gebyr.'), 'fragttaelleren bliver')
ok(view.split('<div className="break-words min-w-0">').length === 4, 'de tre celler bliver')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')
ok(view.includes('Det tælles ikke som 0 kr.'), 'nul-linjen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-coverage-wrap-test')
