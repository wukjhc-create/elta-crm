/**
 * Forfaldshinten paa fakturalisten kan krympe. Teksten bliver.
 *   npx tsx scripts/incoming-invoice-due-hint-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/incoming-invoices/list-client.tsx', 'utf8')
const id = '<span className="text-[11px] text-gray-400 break-words min-w-0">Viser godkendte fakturaer (afventer bogføring/betaling)</span>'
const bare = '<span className="text-[11px] text-gray-400">Viser godkendte fakturaer (afventer bogføring/betaling)</span>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<span'), 'det er en hint')
ok(row.includes('break-words min-w-0'), 'hinten kan krympe')
ok(row === id, 'hinten bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.indexOf(id) === view.lastIndexOf(id), 'hinten findes en gang')
ok(view.split(id).length === 2, 'hinten findes en gang')
ok(view.split(bare).length === 1, 'den bare hint er vaek')
ok(!view.includes(bare), 'den bare hint er vaek')
ok(view.includes('{due && ' + id), 'vagten bliver')
ok(view.includes('<p className="text-sm text-red-700 break-words min-w-0" data-testid="incoming-invoices-load-error">'), 'listefejlen kan stadig krympe')
ok(view.includes('<p className="text-sm text-red-700 break-words min-w-0" data-testid="incoming-invoices-counts-error">'), 'taellefejlen kan stadig krympe')
ok(view.includes('<p className="text-sm text-red-700 break-words min-w-0" data-testid="incoming-invoices-senders-error">'), 'afsenderfejlen kan stadig krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-due-hint-wrap-test')
