/**
 * Linket Indgaaende fakturaer paa fakturadetaljen kan krympe.
 * Linket er uaendret. Sidehovedets raekke er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-back-link-wrap-test.ts
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
const linkAt = view.indexOf('href="/dashboard/incoming-invoices"')
const lineStart = linkAt < 0 ? 0 : view.lastIndexOf('\n', linkAt) + 1
const lineEnd = linkAt < 0 ? 0 : view.indexOf('\n', linkAt)
const linkLine = linkAt < 0 ? '' : view.slice(lineStart, lineEnd).replace(/\r$/, '')
ok(linkLine.includes(wrappedClass), 'tilbage-linket kan krympe')
ok(linkLine.includes('← Indgående fakturaer'), 'linkteksten bliver')
ok(linkLine.includes('href="/dashboard/incoming-invoices"'), 'adressen bliver')
ok(!linkLine.includes(bareClass), 'det bare tilbage-link er vaek')
ok(!linkLine.includes('break-words break-words'), 'et break-words')

const editAt = view.indexOf('data-testid="header-edit-open"')
const editBefore = editAt < 0 ? '' : view.slice(editAt - 200, editAt)
ok(editBefore.includes(wrappedClass), 'ret-knappen bliver')
ok(editBefore.includes('Ret fakturahoved') || view.slice(editAt, editAt + 200).includes('Ret fakturahoved'), 'ret-teksten bliver')

const headerClass = 'className="flex items-start justify-between flex-wrap gap-3"'
ok(view.includes(headerClass), 'sidehovedet bliver')
ok(view.split(headerClass).length === 2, 'sidehovedet er et')
const other = readFileSync('src/app/dashboard/invoices/[id]/detail-client.tsx', 'utf8')
ok(other.includes(headerClass), 'udgaaende sidehoved bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-back-link-wrap-test')
