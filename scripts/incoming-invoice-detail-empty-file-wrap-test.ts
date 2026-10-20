/**
 * Teksten ingen fil paa fakturadetaljen kan krympe.
 * Teksten er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-empty-file-wrap-test.ts
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
const wrapped = '<p className="text-xs text-gray-400 break-words min-w-0">Ingen fil tilknyttet (kilde: {incomingInvoiceSourceLabel(inv.source)}).</p>'
const bare = '<p className="text-xs text-gray-400">Ingen fil tilknyttet (kilde: {incomingInvoiceSourceLabel(inv.source)}).</p>'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'tom fil kan krympe')
ok(after.includes('Ingen fil tilknyttet (kilde: {incomingInvoiceSourceLabel(inv.source)}).'), 'teksten bliver')
ok(view.split(bare).length === 1, 'den bare tomme fil er vaek')
ok(!view.includes(bare), 'den bare tomme fil er vaek')
ok(view.includes('<p className="text-xs text-gray-400 break-words min-w-0">Ingen linjer ekstraheret. Uden linjer er der ikke noget at kontrollere. Tjek bilaget nedenfor.</p>'), 'tomme linjer bliver')
ok(view.includes('<p className="text-xs text-gray-400 break-words min-w-0">Ingen log-poster endnu. De vises her, når fakturaen ændres.</p>'), 'tom historik bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-empty-file-wrap-test')
