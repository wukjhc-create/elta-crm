/**
 * Raekken i fakturadetaljens felt kan krympe.
 * Etiketten og vaerdien er uaendrede. shrink-0 bliver.
 *   npx tsx scripts/incoming-invoice-detail-field-row-wrap-test.ts
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
const wrapped = '<div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 py-1 text-sm border-b last:border-b-0 break-words min-w-0">'
const bare = '<div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 py-1 text-sm border-b last:border-b-0">'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'raekken kan krympe')
ok(after.includes('{label}'), 'etiketten bliver')
ok(after.includes('{value}'), 'vaerdien bliver')
ok(after.includes('<span className="text-gray-500 shrink-0">{label}</span>'), 'etiket-span bliver')
ok(after.includes('shrink-0'), 'shrink-0 bliver')
ok(view.split(bare).length === 1, 'den bare raekke er vaek')
ok(!view.includes(bare), 'den bare raekke er vaek')
ok(view.includes('<h3 className="text-sm font-semibold mb-3 break-words min-w-0">{title}</h3>'), 'overskriften bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-field-row-wrap-test')
