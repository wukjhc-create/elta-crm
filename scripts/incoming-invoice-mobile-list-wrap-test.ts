/**
 * Mobilisten paa fakturalisten kan krympe. Kortene bliver.
 *   npx tsx scripts/incoming-invoice-mobile-list-wrap-test.ts
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
const wrapped = '<div className="md:hidden border rounded overflow-hidden bg-white divide-y break-words min-w-0" data-testid="incoming-invoices-mobile-list">'
const bare = '<div className="md:hidden border rounded overflow-hidden bg-white divide-y" data-testid="incoming-invoices-mobile-list">'
const frame = '<div className="hidden md:block border rounded overflow-hidden bg-white break-words min-w-0">'
const listAt = view.indexOf(wrapped)
const frameAt = view.indexOf(frame)
ok(view.split(wrapped).length === 2, 'mobilisten kan krympe')
ok(listAt >= 0 && frameAt > listAt, 'mobilisten staar foer skrivebordet')
ok(view.split(bare).length === 1, 'den bare mobiliste er vaek')
ok(!view.includes(bare), 'den bare mobiliste er vaek')
ok(view.includes('data-testid="incoming-invoices-mobile-list"'), 'mobilisten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-mobile-list-wrap-test')
