/**
 * Teksten om uaendret status ved et duplikat kan krympe.
 * Teksten er uaendret. Antal og enhed paa mobilkortet er uaendrede.
 *   npx tsx scripts/incoming-invoice-detail-duplicate-note-wrap-test.ts
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
const wrapped = '<span className="text-xs text-gray-500 break-words min-w-0">Status og bogføring er uændret.</span>'
const bare = '<span className="text-xs text-gray-500">Status og bogføring er uændret.</span>'
ok(view.includes(wrapped), 'duplikatteksten kan krympe')
ok(!view.includes(bare), 'den bare duplikattekst er vaek')
ok(view.split(wrapped).length === 2, 'duplikatteksten er en')
ok(!view.includes('break-words break-words'), 'et break-words')
ok(view.includes('Status og bogføring er uændret.'), 'teksten bliver')

const qty = '<p className="text-gray-600 mt-1 break-words min-w-0">{l.quantity ?? \'—\'} {l.unit ?? \'\'}</p>'
ok(view.includes(qty), 'antallet bliver')
ok(view.split(qty).length === 2, 'antallet er et')

const amount = '<div className="text-right min-w-0 break-words">'
ok(view.includes(amount), 'belobskolonnen bliver')
ok(view.split(amount).length === 2, 'belobskolonnen er en')

const actions = '<p className="text-xs text-gray-500">'
ok(view.includes(actions), 'handlingsteksten bliver')
ok(view.split(actions).length === 2, 'handlingsteksten er en')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-duplicate-note-wrap-test')
