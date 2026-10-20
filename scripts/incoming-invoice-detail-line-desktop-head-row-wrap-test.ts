/**
 * Kolonnerekken paa fakturalinjens skrivebord kan krympe.
 * Linjeraekken og de andre tabeller er uaendrede.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-head-row-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
const thead = '<thead className="bg-gray-50 text-left text-gray-600 break-words min-w-0">'
const wrapped = '<tr className="break-words min-w-0">'
const at = view.indexOf(thead)
const win = view.slice(at, at + 260)
ok(at >= 0, 'tabelhovedet bliver')
ok(win.includes(wrapped), 'kolonneraekken kan krympe')
ok(!win.includes('<tr>'), 'den bare kolonneraekke er vaek')
ok(win.split(wrapped).length === 2, 'kolonneraekken er en')
ok(win.includes('>#</th>'), 'kolonnen # bliver')
ok(view.includes('<tr key={l.id}'), 'linjeraekken bliver')
ok(view.includes('<tbody className="break-words min-w-0">'), 'tabelkroppen bliver')
ok(view.includes('data-testid="incoming-invoice-lines-mobile"'), 'mobilkortet bliver')
ok(!view.includes('break-words break-words'), 'et break-words')

const before = view.slice(Math.max(0, at - 80), at)
ok(before.includes('<table className="w-full text-xs">'), 'tabellen bliver')
ok(!before.includes('break-words'), 'tabellen har ikke wrap')

const approve = readFileSync('src/app/dashboard/incoming-invoices/[id]/approve-preview-dialog.tsx', 'utf8')
const ap = approve.indexOf('<thead className="bg-gray-50 text-left text-gray-600">')
ok(ap >= 0, 'godkendelsesdialogen har tabelhoved')
ok(approve.slice(ap, ap + 180).includes('<tr>'), 'godkendelsesdialogen bliver')
ok(!approve.includes(wrapped), 'godkendelsesdialogen er ikke pakket')

const preview = readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
ok(preview.includes('<tr>'), 'konverteringspanelets raekke bliver')
ok(!preview.includes(wrapped), 'konverteringspanelet er ikke pakket')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-head-row-wrap-test')
