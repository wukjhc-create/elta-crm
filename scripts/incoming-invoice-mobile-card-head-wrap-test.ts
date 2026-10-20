/**
 * Titelraekken paa fakturalistens mobilkort kan krympe. Navn og status bliver.
 *   npx tsx scripts/incoming-invoice-mobile-card-head-wrap-test.ts
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
const wrapped = '<div className="flex items-start justify-between gap-2 break-words min-w-0">'
const bare = '<div className="flex items-start justify-between gap-2">'
const list = 'data-testid="incoming-invoices-mobile-list"'
const rowAt = view.indexOf(wrapped)
const listAt = view.indexOf(list)
ok(view.split(wrapped).length === 2, 'titelraekken kan krympe')
ok(rowAt >= 0 && listAt >= 0 && rowAt > listAt, 'titelraekken staar i mobilisten')
ok(view.split(bare).length === 1, 'den bare titelraekke er vaek')
ok(!view.includes(bare), 'den bare titelraekke er vaek')
ok(view.includes("{r.supplier_name || 'Leverandør mangler'}"), 'navnet bliver')
ok(view.includes('<StatusBadge row={r} />'), 'status bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-mobile-card-head-wrap-test')
