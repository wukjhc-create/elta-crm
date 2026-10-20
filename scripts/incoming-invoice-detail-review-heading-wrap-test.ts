/**
 * Overskriften om manuel gennemgang paa fakturadetaljen kan krympe.
 * Saetningen bliver. Andre elementer med samme korte klasse er uændrede.
 *   npx tsx scripts/incoming-invoice-detail-review-heading-wrap-test.ts
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
const wrapped = '<div className="font-medium text-amber-900 break-words min-w-0">Faktura kræver manuel gennemgang</div>'
const bare = '<div className="font-medium text-amber-900">Faktura kræver manuel gennemgang</div>'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + wrapped.length)
ok(view.split(wrapped).length === 2, 'overskriften kan krympe')
ok(after.includes('Faktura kræver manuel gennemgang'), 'saetningen bliver')
ok(view.split(bare).length === 1, 'den bare overskrift er vaek')
ok(!view.includes(bare), 'den bare overskrift er vaek')
ok(view.includes('<p className="text-sm text-amber-800 mt-1 break-words min-w-0">'), 'konfidenslinjen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-review-heading-wrap-test')
