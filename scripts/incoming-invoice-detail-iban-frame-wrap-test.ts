/**
 * Rammen om IBAN-vaerdien paa fakturadetaljen kan krympe.
 * Indholdet er uaendret. Vis-knappen er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-iban-frame-wrap-test.ts
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
const wrapped = '<span className="inline-flex items-center gap-2 break-words min-w-0">'
const bare = '<span className="inline-flex items-center gap-2">'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'rammen kan krympe')
ok(after.includes('data-testid="iban-value"'), 'vaerdien bliver')
ok(view.split(bare).length === 1, 'den bare ramme er vaek')
ok(!view.includes(bare), 'den bare ramme er vaek')
ok(view.includes('<span className="font-mono break-words min-w-0" data-testid="iban-value">{full ?? masked}</span>'), 'iban-vaerdien bliver')
const revealAt = view.indexOf('data-testid="iban-reveal"')
const revealBefore = revealAt < 0 ? '' : view.slice(revealAt - 200, revealAt)
ok(revealBefore.includes('className="text-xs text-emerald-700 hover:underline break-words min-w-0"'), 'vis-knappen bliver')
ok(!revealBefore.includes('break-words break-words'), 'vis-knappen har et break-words')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-iban-frame-wrap-test')
