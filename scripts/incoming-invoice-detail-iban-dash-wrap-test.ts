/**
 * Den tomme IBAN-streg paa fakturadetaljen kan krympe.
 * Stregen er uaendret. IBAN-vaerdien er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-iban-dash-wrap-test.ts
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
const wrapped = '<span className="font-mono break-words min-w-0">—</span>'
const bare = '<span className="font-mono">—</span>'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'stregen kan krympe')
ok(after.includes('—'), 'stregen bliver')
ok(view.split(bare).length === 1, 'den bare streg er vaek')
ok(!view.includes(bare), 'den bare streg er vaek')
ok(view.includes('<span className="text-gray-500 shrink-0 break-words min-w-0">{label}</span>'), 'etiketten bliver')
ok(view.includes('<span className="font-mono break-words min-w-0" data-testid="iban-value">{full ?? masked}</span>'), 'iban-vaerdien bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-iban-dash-wrap-test')
