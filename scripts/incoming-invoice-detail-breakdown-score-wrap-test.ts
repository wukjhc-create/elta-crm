/**
 * Totalscoren i match-breakdown paa fakturadetaljen kan krympe.
 * Scoren er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-breakdown-score-wrap-test.ts
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
const wrapped = 'className="w-12 shrink-0 text-right font-mono font-medium break-words min-w-0"'
const bare = 'className="w-12 shrink-0 text-right font-mono font-medium"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'totalscoren kan krympe')
ok(after.includes('Number(breakdown.total ?? 0).toFixed(2)'), 'scoren bliver')
ok(view.split(bare).length === 1, 'den bare totalscore er vaek')
ok(!view.includes(bare), 'den bare totalscore er vaek')
ok(view.includes('className="flex items-center gap-2 text-xs pt-1 border-t break-words min-w-0"'), 'totalraekken bliver')
ok(view.includes('className="h-2 bg-blue-500"'), 'den blaa bjaelke bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-breakdown-score-wrap-test')
