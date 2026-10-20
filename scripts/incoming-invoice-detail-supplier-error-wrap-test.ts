/**
 * Fejlen om leverandor paa fakturadetaljen kan krympe.
 * Saetningen er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-supplier-error-wrap-test.ts
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
const wrapped = 'className="text-red-800 break-words min-w-0" data-testid="incoming-invoice-supplier-error"'
const bare = 'className="text-red-800" data-testid="incoming-invoice-supplier-error"'
const sentence = 'Leverandøren kunne ikke hentes. Det tælles ikke som ikke matchet.'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'leverandoerfejlen kan krympe')
ok(after.includes(sentence), 'saetningen bliver')
ok(view.split(bare).length === 1, 'den bare leverandoerfejl er vaek')
ok(!view.includes(bare), 'den bare leverandoerfejl er vaek')
ok(view.includes('className="text-xs text-red-800 mb-2 break-words min-w-0" data-testid="incoming-invoice-audit-names-error"'), 'navnefejlen bliver')
ok(view.includes('className="text-red-800 break-words min-w-0" data-testid="incoming-invoice-case-error"'), 'sagsfejlen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-supplier-error-wrap-test')
