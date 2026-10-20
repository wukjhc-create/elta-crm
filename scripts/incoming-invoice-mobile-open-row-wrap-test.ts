/**
 * Aabn-raekken paa fakturalistens mobilkort kan krympe. Knappen bliver.
 *   npx tsx scripts/incoming-invoice-mobile-open-row-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/incoming-invoices/list-client.tsx', 'utf8')
const wrapped = '<div className="mt-3 break-words min-w-0">'
const bare = '<div className="mt-3">'
const confidence = '<p className="mt-2 text-xs break-words min-w-0">'
const rowAt = view.indexOf(wrapped)
const confidenceAt = view.indexOf(confidence)
ok(view.split(wrapped).length === 2, 'aabn-raekken kan krympe')
ok(rowAt >= 0 && confidenceAt >= 0 && rowAt > confidenceAt, 'aabn-raekken staar under konfidenslinjen')
ok(view.split(bare).length === 1, 'den bare aabn-raekke er vaek')
ok(!view.includes(bare), 'den bare aabn-raekke er vaek')
ok(view.includes('<Button size="sm" variant="outline" aria-label={openInvoiceLabel(r)}>Åbn</Button>'), 'knappen bliver')
ok(view.includes('openInvoiceLabel(r)'), 'etiketten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-mobile-open-row-wrap-test')
