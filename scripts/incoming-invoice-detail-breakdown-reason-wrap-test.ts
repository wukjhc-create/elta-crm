/**
 * Aarsagskoden i match-breakdown paa fakturadetaljen kan krympe.
 * Aarsagsteksten er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-breakdown-reason-wrap-test.ts
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
const wrapped = 'className="ml-2 bg-gray-100 px-1 rounded break-words min-w-0"'
const bare = 'className="ml-2 bg-gray-100 px-1 rounded"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'aarsagskoden kan krympe')
ok(after.includes('{r}'), 'aarsagsteksten bliver')
ok(view.split(bare).length === 1, 'den bare aarsagskode er vaek')
ok(!view.includes(bare), 'den bare aarsagskode er vaek')
ok(view.includes('className="w-28 sm:w-44 shrink-0 font-medium break-words min-w-0"'), 'totalordet bliver')
ok(view.includes('className="text-xs text-red-800" data-testid="incoming-invoice-lines-error"'), 'linjefejlen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-breakdown-reason-wrap-test')
