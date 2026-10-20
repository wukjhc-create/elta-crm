/**
 * Ordet match i konfidensen paa fakturalisten kan krympe. Ordet parse bliver.
 *   npx tsx scripts/incoming-invoice-confidence-match-wrap-test.ts
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
const wrappedMatch = '<span className="text-gray-500 break-words min-w-0">match</span>'
const bareMatch = '<span className="text-gray-500">match</span>'
const wrappedParse = '<span className="text-gray-500 break-words min-w-0">parse</span>'
const classMarker = 'className="text-gray-500 break-words min-w-0"'
const first = view.indexOf(classMarker)
const second = first < 0 ? -1 : view.indexOf(classMarker, first + classMarker.length)
const after = second < 0 ? '' : view.slice(second + classMarker.length, second + classMarker.length + 40).replace(/\s+/g, '')
ok(view.split(wrappedMatch).length === 2, 'ordet match kan krympe')
ok(after.startsWith('>match<'), 'ordet match bliver')
ok(!view.includes(bareMatch), 'den bare match-etiket er vaek')
ok(view.split(wrappedParse).length === 2, 'ordet parse bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-confidence-match-wrap-test')
