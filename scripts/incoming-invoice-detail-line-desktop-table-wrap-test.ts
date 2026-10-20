/**
 * Tabellen paa fakturalinjens skrivebord kan krympe.
 * Rullen og de andre tabeller er uaendrede.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-table-wrap-test.ts
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
const wrapped = '<table className="w-full text-xs break-words min-w-0">'
const bare = '<table className="w-full text-xs">'
const thead = '<thead className="bg-gray-50 text-left text-gray-600 break-words min-w-0">'
ok(view.includes(wrapped), 'tabellen kan krympe')
ok(!view.includes(bare), 'den bare tabel er vaek')
ok(view.split(wrapped).length === 2, 'tabellen er en')
ok(view.includes(thead), 'tabelhovedet bliver')
ok(view.includes('<tr className="break-words min-w-0">'), 'kolonneraekken bliver')
ok(view.includes('<tbody className="break-words min-w-0">'), 'tabelkroppen bliver')
ok(view.includes('data-testid="incoming-invoice-lines-mobile"'), 'mobilkortet bliver')
ok(!view.includes('break-words break-words'), 'et break-words')

const at = view.indexOf(thead)
const before = view.slice(Math.max(0, at - 220), at)
ok(before.includes('<div className="hidden md:block overflow-x-auto break-words min-w-0">'), 'rullen kan krympe')
ok(!before.includes('<div className="hidden md:block overflow-x-auto">'), 'den bare rulle er vaek')

const approve = readFileSync('src/app/dashboard/incoming-invoices/[id]/approve-preview-dialog.tsx', 'utf8')
ok(approve.includes(bare), 'godkendelsesdialogen bliver')
ok(!approve.includes(wrapped), 'godkendelsesdialogen er ikke pakket')

const preview = readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
ok(preview.includes(bare), 'konverteringspanelets tabel bliver')
ok(!preview.includes(wrapped), 'konverteringspanelet er ikke pakket')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-table-wrap-test')
