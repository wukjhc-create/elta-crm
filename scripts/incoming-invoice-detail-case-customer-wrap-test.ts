/**
 * Kundenavnet ved sagen paa fakturadetaljen kan krympe.
 * Navnet er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-case-customer-wrap-test.ts
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
const wrapped = '<span className="text-gray-500 ml-1 break-words min-w-0">· {detail.case.customer_name}</span>'
const bare = '<span className="text-gray-500 ml-1">· {detail.case.customer_name}</span>'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'kundenavnet kan krympe')
ok(after.includes('{detail.case.customer_name}'), 'navnet bliver')
ok(view.split(bare).length === 1, 'det bare kundenavn er vaek')
ok(!view.includes(bare), 'det bare kundenavn er vaek')
ok(view.includes('<span className="text-gray-400 break-words min-w-0">Ingen specifik WO</span>'), 'ingen-wo bliver')
ok(view.includes('<span className="text-gray-400 break-words min-w-0">({detail.supplier.code ?? \'—\'})</span>'), 'leverandoerkoden bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-case-customer-wrap-test')
