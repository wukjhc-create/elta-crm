/**
 * Rullen paa fakturalinjens skrivebord kan krympe.
 * Mobilisten og de andre ruller er uaendrede.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-scroll-wrap-test.ts
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
const wrapped = '<div className="hidden md:block overflow-x-auto break-words min-w-0">'
const bare = '<div className="hidden md:block overflow-x-auto">'
const table = '<table className="w-full text-xs break-words min-w-0">'
ok(view.includes(wrapped), 'rullen kan krympe')
ok(!view.includes(bare), 'den bare rulle er vaek')
ok(view.split(wrapped).length === 2, 'rullen er en')
ok(view.includes(table), 'tabellen bliver')
ok(view.includes('<div className="md:hidden space-y-2" data-testid="incoming-invoice-lines-mobile">'), 'mobilisten bliver')
ok(!view.includes('break-words break-words'), 'et break-words')

const preview = readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
ok(preview.includes(bare), 'konverteringspanelets rulle bliver')
ok(!preview.includes(wrapped), 'konverteringspanelet er ikke pakket')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-scroll-wrap-test')
