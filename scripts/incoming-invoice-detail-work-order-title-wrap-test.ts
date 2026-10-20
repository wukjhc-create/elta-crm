/**
 * Arbejdsordretitlen uden sag paa fakturadetaljen kan krympe.
 * Titlen er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-work-order-title-wrap-test.ts
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
const wrapped = '<span className="text-gray-700 break-words min-w-0">{detail.workOrder.title}</span>'
const bare = '<span className="text-gray-700">{detail.workOrder.title}</span>'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'arbejdsordretitlen kan krympe')
ok(after.includes('{detail.workOrder.title}'), 'titlen bliver')
ok(view.split(bare).length === 1, 'den bare arbejdsordretitel er vaek')
ok(!view.includes(bare), 'den bare arbejdsordretitel er vaek')
ok(view.includes('className="text-red-800 break-words min-w-0" data-testid="incoming-invoice-work-order-error"'), 'arbejdsordrefejlen bliver')
ok(view.includes('<span className="text-gray-400">Ingen specifik WO</span>'), 'ingen-wo bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-work-order-title-wrap-test')
