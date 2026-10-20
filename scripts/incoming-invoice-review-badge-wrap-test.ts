/**
 * Maerket Kraever gennemgang paa fakturalisten kan krympe. Teksten bliver.
 *   npx tsx scripts/incoming-invoice-review-badge-wrap-test.ts
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
const wrapped = 'className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 break-words min-w-0"'
const bare = 'className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt + wrapped.length, classAt + wrapped.length + 80).replace(/\s+/g, '')
ok(view.split(wrapped).length === 2, 'gennemgangsmaerket kan krympe')
ok(after.startsWith('>Krævergennemgang<'), 'teksten bliver')
ok(view.split(bare).length === 1, 'det bare gennemgangsmaerke er vaek')
ok(!view.includes(bare), 'det bare gennemgangsmaerke er vaek')
ok(view.includes('Kræver gennemgang'), 'teksten Kræver gennemgang bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-review-badge-wrap-test')
