/**
 * Vis-knappen ved IBAN paa fakturadetaljen kan krympe.
 * Knappen er uaendret. Ret fakturahoved kan ogsaa krympe.
 *   npx tsx scripts/incoming-invoice-detail-iban-reveal-wrap-test.ts
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
const wrappedClass = 'className="text-xs text-emerald-700 hover:underline break-words min-w-0"'
const bareClass = 'className="text-xs text-emerald-700 hover:underline"'
const revealAt = view.indexOf('data-testid="iban-reveal"')
const revealBefore = revealAt < 0 ? '' : view.slice(revealAt - 200, revealAt)
const after = revealAt < 0 ? '' : view.slice(revealAt, revealAt + 1600)
ok(revealBefore.includes(wrappedClass), 'vis-knappen kan krympe')
ok(after.includes("{full ? 'Skjul' : 'Vis'}"), 'teksten bliver')
ok(!revealBefore.includes(bareClass), 'den bare vis-knap er vaek')
ok(!revealBefore.includes('break-words break-words'), 'et break-words')
ok(view.includes('<span className="inline-flex items-center gap-2 break-words min-w-0">'), 'rammen bliver')
const editAt = view.indexOf('data-testid="header-edit-open"')
const editBefore = editAt < 0 ? '' : view.slice(editAt - 200, editAt)
ok(editBefore.includes('className="text-xs text-emerald-700 hover:underline break-words min-w-0"'), 'ret-knappen bliver')
ok(!editBefore.includes('break-words break-words'), 'ret-knappen har et break-words')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-iban-reveal-wrap-test')
