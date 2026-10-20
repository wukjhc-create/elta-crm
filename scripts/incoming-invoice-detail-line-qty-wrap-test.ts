/**
 * Antal og enhed paa fakturalinjens mobilkort kan krympe.
 * Antal og enhed er uaendrede. Totalen er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-qty-wrap-test.ts
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
const wrapped = '<p className="text-gray-600 mt-1 break-words min-w-0">{l.quantity ?? \'—\'} {l.unit ?? \'\'}</p>'
const bare = '<p className="text-gray-600 mt-1">{l.quantity ?? \'—\'} {l.unit ?? \'\'}</p>'
ok(view.includes(wrapped), 'antallet kan krympe')
ok(!view.includes(bare), 'det bare antal er vaek')
ok(view.split(wrapped).length === 2, 'antallet er et')
ok(!view.includes('break-words break-words'), 'et break-words')
ok(view.includes('{l.quantity ?? \'—\'}'), 'antallet bliver')
ok(view.includes('{l.unit ?? \'\'}'), 'enheden bliver')

const total = '<p className="font-medium break-words min-w-0">Total {fmtAmount(l.total_price, inv.currency)}</p>'
ok(view.includes(total), 'totalen bliver')
ok(view.split(total).length === 2, 'totalen er en')

const note = '<span className="text-xs text-gray-500 break-words min-w-0">Status og bogføring er uændret.</span>'
ok(view.includes(note), 'duplikatteksten bliver')
ok(view.split(note).length === 2, 'duplikatteksten er en')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-qty-wrap-test')
