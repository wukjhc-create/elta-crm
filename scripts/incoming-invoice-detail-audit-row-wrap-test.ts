/**
 * Raekken i revisionsloggen kan krympe.
 * Indholdet er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-audit-row-wrap-test.ts
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
const wrapped = '<div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 break-words min-w-0">'
const bare = '<div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5">'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'raekken kan krympe')
ok(after.includes('incomingInvoiceAuditActionLabel(a.action)'), 'handlingen bliver')
ok(view.split(bare).length === 1, 'den bare raekke er vaek')
ok(!view.includes(bare), 'den bare raekke er vaek')
ok(view.includes('<span className="text-gray-500 shrink-0 break-words min-w-0">{fmtDate(a.created_at)} {a.created_at.slice(11, 19)}</span>'), 'tidspunktet bliver')
ok(view.includes('<div className="mt-0.5 text-gray-700 break-words">{a.message}</div>'), 'beskeden bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-audit-row-wrap-test')
