/**
 * Knappen Ret fakturahoved paa fakturadetaljen kan krympe.
 * Knappen er uaendret. Linket tilbage kan ogsaa krympe.
 *   npx tsx scripts/incoming-invoice-detail-header-edit-wrap-test.ts
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
const editAt = view.indexOf('data-testid="header-edit-open"')
const editBefore = editAt < 0 ? '' : view.slice(editAt - 200, editAt)
const after = editAt < 0 ? '' : view.slice(editAt, editAt + 400)
ok(editBefore.includes(wrappedClass), 'ret-knappen kan krympe')
ok(after.includes('Ret fakturahoved'), 'teksten bliver')
ok(editBefore.includes('setEditingHeader(true)'), 'klikket bliver')
ok(!editBefore.includes(bareClass), 'den bare ret-knap er vaek')
ok(!editBefore.includes('break-words break-words'), 'et break-words')
ok(view.includes('<span className="inline-flex items-center gap-2 break-words min-w-0">'), 'rammen bliver')

const revealAt = view.indexOf('data-testid="iban-reveal"')
const revealBefore = revealAt < 0 ? '' : view.slice(revealAt - 200, revealAt)
ok(revealBefore.includes(wrappedClass), 'vis-knappen bliver')

const linkAt = view.indexOf('href="/dashboard/incoming-invoices"')
const lineStart = linkAt < 0 ? 0 : view.lastIndexOf('\n', linkAt) + 1
const lineEnd = linkAt < 0 ? 0 : view.indexOf('\n', linkAt)
const linkLine = linkAt < 0 ? '' : view.slice(lineStart, lineEnd).replace(/\r$/, '')
ok(linkLine.includes(wrappedClass), 'tilbage-linket bliver')
ok(!linkLine.includes('break-words break-words'), 'tilbage-linket har et break-words')
ok(linkLine.includes('← Indgående fakturaer'), 'linkteksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-header-edit-wrap-test')
