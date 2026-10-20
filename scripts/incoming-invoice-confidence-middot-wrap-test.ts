/**
 * Skilletegnet i konfidensen paa fakturalisten kan krympe. Tegnet bliver.
 *   npx tsx scripts/incoming-invoice-confidence-middot-wrap-test.ts
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
const wrapped = 'className="text-gray-400 mx-1 break-words min-w-0"'
const bare = 'className="text-gray-400 mx-1"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt + wrapped.length, classAt + wrapped.length + 40).replace(/\s+/g, '')
ok(view.split(wrapped).length === 2, 'skilletegnet kan krympe')
ok(after.startsWith('>·<'), 'tegnet bliver')
ok(view.split(bare).length === 1, 'det bare skilletegn er vaek')
ok(!view.includes(bare), 'det bare skilletegn er vaek')
ok(view.includes('<span className="text-gray-500">parse</span>'), 'ordet parse bliver')
ok(view.includes('<span className="text-gray-500">match</span>'), 'ordet match bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-confidence-middot-wrap-test')
