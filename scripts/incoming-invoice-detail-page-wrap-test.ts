/**
 * Fakturadetaljens side kan krympe. Indholdet bliver.
 *   npx tsx scripts/incoming-invoice-detail-page-wrap-test.ts
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
const wrapped = 'className="p-4 md:p-6 space-y-4 max-w-6xl break-words min-w-0"'
const bare = 'className="p-4 md:p-6 space-y-4 max-w-6xl"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt + wrapped.length, classAt + wrapped.length + 400)
ok(view.split(wrapped).length === 2, 'fakturadetaljens side kan krympe')
ok(after.includes('← Indgående fakturaer'), 'tilbage-linket bliver')
ok(view.split(bare).length === 1, 'den bare side er vaek')
ok(!view.includes(bare), 'den bare side er vaek')
ok(view.includes('className="text-2xl font-semibold break-words"'), 'beloebet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-page-wrap-test')
