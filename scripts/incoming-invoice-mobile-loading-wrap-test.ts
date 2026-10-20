/**
 * Henter-linjen paa fakturalistens mobiliste kan krympe. Teksten bliver.
 *   npx tsx scripts/incoming-invoice-mobile-loading-wrap-test.ts
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
const wrapped = '<p className="px-3 py-6 text-center text-gray-400 text-xs break-words min-w-0">Henter…</p>'
const bare = '<p className="px-3 py-6 text-center text-gray-400 text-xs">Henter…</p>'
const mobile = 'data-testid="incoming-invoices-mobile-list"'
const desktop = '<td colSpan={8} className="px-3 py-6 text-center text-gray-400 text-xs">Henter…</td>'
const rowAt = view.indexOf(wrapped)
const mobileAt = view.indexOf(mobile)
const desktopAt = view.indexOf(desktop)
ok(view.split(wrapped).length === 2, 'henter-linjen kan krympe')
ok(rowAt >= 0 && mobileAt >= 0 && desktopAt >= 0 && rowAt > mobileAt && rowAt < desktopAt, 'henter-linjen staar i mobilisten')
ok(view.split(bare).length === 1, 'den bare henter-linje er vaek')
ok(!view.includes(bare), 'den bare henter-linje er vaek')
ok(view.includes(desktop), 'skrivebordets celle bliver')
ok(view.includes('Henter…'), 'teksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-mobile-loading-wrap-test')
