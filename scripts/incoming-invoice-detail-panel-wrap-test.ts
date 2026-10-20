/**
 * Panelet paa fakturadetaljen kan krympe.
 * Indholdet og overskriften er uaendrede.
 *   npx tsx scripts/incoming-invoice-detail-panel-wrap-test.ts
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
const wrapped = '<div className="bg-white rounded-lg ring-1 ring-gray-200 p-4 break-words min-w-0">'
const bare = '<div className="bg-white rounded-lg ring-1 ring-gray-200 p-4">'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'panelet kan krympe')
ok(after.includes('{children}'), 'indholdet bliver')
ok(after.includes('<h3 className="text-sm font-semibold mb-3">{title}</h3>'), 'overskriften bliver')
ok(view.split(bare).length === 1, 'det bare panel er vaek')
ok(!view.includes(bare), 'det bare panel er vaek')
ok(view.includes('<div className="mt-0.5 text-gray-700 break-words min-w-0">{a.message}</div>'), 'beskeden bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-panel-wrap-test')
