/**
 * Kolonnen Enhed paa fakturalinjens skrivebord kan krympe.
 * Overskriften er uaendret. Enhedscellen er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-enhed-head-wrap-test.ts
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
const wrapped = '<th className="px-2 py-1 break-words min-w-0">Enhed</th>'
const bare = '<th className="px-2 py-1">Enhed</th>'
ok(view.includes(wrapped), 'enhedskolonnen kan krympe')
ok(!view.includes(bare), 'den bare enhedskolonne er vaek')
ok(view.split(wrapped).length === 2, 'enhedskolonnen er en')
ok(!view.includes('break-words break-words'), 'et break-words')

const desc = '<th className="px-2 py-1 break-words min-w-0">Beskrivelse</th>'
ok(view.includes(desc), 'beskrivelseskolonnen bliver')
ok(view.split(desc).length === 2, 'beskrivelseskolonnen er en')

const hash = '<th className="px-2 py-1 break-words min-w-0">#</th>'
ok(view.includes(hash), 'nummerkolonnen bliver')
ok(view.split(hash).length === 2, 'nummerkolonnen er en')

const num = '<td className="px-2 py-1 break-words min-w-0">{l.line_number}</td>'
ok(view.includes(num), 'linjenummercellen bliver')
ok(view.split(num).length === 2, 'linjenummercellen er en')

const unitCell = '<td className="px-2 py-1 break-words min-w-0">{l.unit ?? \'—\'}</td>'
ok(view.includes(unitCell), 'enhedscellen bliver')
ok(view.split(unitCell).length === 2, 'enhedscellen er en')

const stk = '<th className="px-2 py-1 text-right break-words min-w-0">Stk-pris</th>'
ok(view.includes(stk), 'stkpriskolonnen bliver')
ok(view.split(stk).length === 2, 'stkpriskolonnen er en')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-enhed-head-wrap-test')
