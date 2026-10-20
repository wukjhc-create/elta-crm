/**
 * Teksten ingen log-poster paa fakturadetaljen kan krympe.
 * Teksten er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-empty-audit-wrap-test.ts
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
const wrapped = '<p className="text-xs text-gray-400 break-words min-w-0">Ingen log-poster endnu. De vises her, når fakturaen ændres.</p>'
const bare = '<p className="text-xs text-gray-400">Ingen log-poster endnu. De vises her, når fakturaen ændres.</p>'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'tom historik kan krympe')
ok(after.includes('Ingen log-poster endnu. De vises her, når fakturaen ændres.'), 'teksten bliver')
ok(view.split(bare).length === 1, 'den bare tomme historik er vaek')
ok(!view.includes(bare), 'den bare tomme historik er vaek')
ok(view.includes('<p className="text-xs text-gray-400 break-words min-w-0">Ingen fil tilknyttet (kilde: {incomingInvoiceSourceLabel(inv.source)}).</p>'), 'tom fil bliver')
ok(view.includes('<span className="text-gray-500 break-words min-w-0">· {a.actor_name}</span>'), 'afsenderen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-empty-audit-wrap-test')
