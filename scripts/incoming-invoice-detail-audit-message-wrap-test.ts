/**
 * Beskeden i revisionsloggen kan krympe.
 * Beskeden er uaendret. break-words bliver. Kun min-w-0 er tilfoejet.
 *   npx tsx scripts/incoming-invoice-detail-audit-message-wrap-test.ts
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
const wrapped = '<div className="mt-0.5 text-gray-700 break-words min-w-0">{a.message}</div>'
const bare = '<div className="mt-0.5 text-gray-700 break-words">{a.message}</div>'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'beskeden kan krympe')
ok(after.includes('{a.message}'), 'teksten bliver')
ok(wrapped.includes('break-words'), 'break-words bliver')
ok(!wrapped.includes('break-words break-words'), 'break-words er ikke dobbelt')
ok(view.split(bare).length === 1, 'den bare besked er vaek')
ok(!view.includes(bare), 'den bare besked er vaek')
ok(view.includes('<div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 break-words min-w-0">'), 'raekken bliver')
ok(view.includes('<div className="bg-white rounded-lg ring-1 ring-gray-200 p-4 break-words min-w-0">'), 'panelet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-audit-message-wrap-test')
