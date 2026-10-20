/**
 * Skrivebordsrammen paa fakturalisten kan krympe. Tabellen bliver.
 *   npx tsx scripts/incoming-invoice-desktop-frame-wrap-test.ts
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
const wrapped = '<div className="hidden md:block border rounded overflow-hidden bg-white break-words min-w-0">'
const bare = '<div className="hidden md:block border rounded overflow-hidden bg-white">'
const table = '<table className="w-full text-sm break-words min-w-0">'
const frameAt = view.indexOf(wrapped)
const tableAt = view.indexOf(table)
ok(view.split(wrapped).length === 2, 'skrivebordsrammen kan krympe')
ok(frameAt >= 0 && tableAt > frameAt, 'tabellen staar i skrivebordsrammen')
ok(view.split(bare).length === 1, 'den bare skrivebordsramme er vaek')
ok(!view.includes(bare), 'den bare skrivebordsramme er vaek')
ok(view.includes('>Leverandør</th>'), 'kolonnerne bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-desktop-frame-wrap-test')
