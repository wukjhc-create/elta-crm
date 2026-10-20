/**
 * Tidspunktet i revisionsloggen kan krympe.
 * Tidspunktet er uaendret. shrink-0 bliver.
 *   npx tsx scripts/incoming-invoice-detail-audit-time-wrap-test.ts
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
const wrapped = '<span className="text-gray-500 shrink-0 break-words min-w-0">{fmtDate(a.created_at)} {a.created_at.slice(11, 19)}</span>'
const bare = '<span className="text-gray-500 shrink-0">{fmtDate(a.created_at)} {a.created_at.slice(11, 19)}</span>'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'tidspunktet kan krympe')
ok(after.includes('{fmtDate(a.created_at)} {a.created_at.slice(11, 19)}'), 'udtrykket bliver')
ok(view.split(bare).length === 1, 'det bare tidspunkt er vaek')
ok(!view.includes(bare), 'det bare tidspunkt er vaek')
ok(wrapped.includes('shrink-0'), 'shrink-0 bliver')
ok(view.includes('<span className="text-gray-500 break-words min-w-0">· {a.actor_name}</span>'), 'afsenderen bliver')
ok(view.includes('<div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5">'), 'raekken bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-audit-time-wrap-test')
