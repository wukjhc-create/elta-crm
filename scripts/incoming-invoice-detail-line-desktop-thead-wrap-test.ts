/**
 * Tabelhovedet paa fakturalinjens skrivebord kan krympe.
 * Kolonneraekken og de andre tabeller er uaendrede.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-thead-wrap-test.ts
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
const wrapped = '<thead className="bg-gray-50 text-left text-gray-600 break-words min-w-0">'
const bare = '<thead className="bg-gray-50 text-left text-gray-600">'
ok(view.includes(wrapped), 'tabelhovedet kan krympe')
ok(!view.includes(bare), 'det bare tabelhoved er vaek')
ok(view.split(wrapped).length === 2, 'tabelhovedet er et')
ok(view.includes('<tbody className="break-words min-w-0">'), 'tabelkroppen bliver')
ok(view.includes('data-testid="incoming-invoice-lines-mobile"'), 'mobilkortet bliver')
ok(!view.includes('break-words break-words'), 'et break-words')

const at = view.indexOf(wrapped)
const win = view.slice(at, at + 220)
ok(win.includes('<tr className="break-words min-w-0">'), 'kolonneraekken kan krympe')
ok(win.includes('>#</th>'), 'kolonnen # bliver')
ok(!win.includes('<tr>'), 'den bare kolonneraekke er vaek')

const approve = readFileSync('src/app/dashboard/incoming-invoices/[id]/approve-preview-dialog.tsx', 'utf8')
ok(approve.includes(bare), 'godkendelsesdialogen bliver')
ok(!approve.includes(wrapped), 'godkendelsesdialogen er ikke pakket')

const outgoing = readFileSync('src/app/dashboard/invoices/[id]/detail-client.tsx', 'utf8')
ok(outgoing.includes(bare), 'den udgaaende faktura bliver')
ok(!outgoing.includes(wrapped), 'den udgaaende faktura er ikke pakket')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-thead-wrap-test')
