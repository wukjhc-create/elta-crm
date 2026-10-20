/**
 * Opsummeringsgitteret paa fakturakontrol kan krympe. Beloebene bliver.
 *   npx tsx scripts/invoice-control-summary-grid-wrap-test.ts
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
const id = '<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mb-3 break-words min-w-0">'
const oldId = '<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mb-3 min-w-0">'
const marker = 'data-testid="invoice-control-label-controlled"'
const markerAt = view.indexOf(marker)
const at = markerAt >= 0 ? view.lastIndexOf(id, markerAt) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && markerAt >= at ? view.slice(at, markerAt + marker.length) : ''
ok(row.startsWith('<div'), 'det er et gitter')
ok(row.includes('break-words min-w-0'), 'gitteret kan krympe')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'gitteret staar foer etiketten')
ok(between.indexOf('<div className="grid', 1) === -1, 'det er det naermeste gitter')
ok(between.includes('<div className="break-words min-w-0">'), 'cellen kan krympe')
ok(!between.includes('<div className="min-w-0">'), 'cellen er ikke bar')
ok(between.includes(marker), 'det er kontrollerede linjer')
ok(!between.includes('overchargeAmount'), 'beloebet er et andet sted')
ok(view.split(id).length === 2, 'gitteret findes en gang')
ok(view.split(oldId).length === 1, 'det bare gitter er vaek')
ok(!view.includes(oldId), 'ingen bart gitter bliver')
ok(view.split('<div className="min-w-0">').length === 1, 'ingen bar celle bliver')
ok(view.includes('kr(res.control.overchargeAmount)'), 'overprisbeloebet bliver')
ok(view.includes('{res.control.controlledLines} / {res.control.totalLines}'), 'daekningen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-summary-grid-wrap-test')
