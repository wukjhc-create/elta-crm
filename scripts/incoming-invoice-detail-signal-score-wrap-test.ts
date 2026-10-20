/**
 * Signalscoren i match-breakdown kan krympe.
 * Scoren er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-signal-score-wrap-test.ts
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
const wrapped = '<span className="w-12 shrink-0 text-right font-mono break-words min-w-0">{score.toFixed(2)}</span>'
const bare = '<span className="w-12 shrink-0 text-right font-mono">{score.toFixed(2)}</span>'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 1600)
ok(view.split(wrapped).length === 2, 'signalscoren kan krympe')
ok(after.includes('{score.toFixed(2)}'), 'scoren bliver')
ok(view.split(bare).length === 1, 'den bare signalscore er vaek')
ok(!view.includes(bare), 'den bare signalscore er vaek')
ok(view.includes('shrink-0'), 'shrink-0 bliver')
ok(view.includes('<span className="font-mono break-words min-w-0">{inv.payment_reference ?? \'—\'}</span>'), 'betalingsreferencen bliver')
ok(view.includes('<p className="text-xs text-gray-400 break-words min-w-0">Ingen linjer ekstraheret. Uden linjer er der ikke noget at kontrollere. Tjek bilaget nedenfor.</p>'), 'tomme linjer bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-signal-score-wrap-test')
