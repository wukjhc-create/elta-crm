/**
 * Overskriften paa fakturalisten kan krympe. Teksten bliver.
 *   npx tsx scripts/incoming-invoice-heading-wrap-test.ts
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
const id = '<h1 className="text-2xl font-semibold break-words min-w-0">Indgående fakturaer</h1>'
const bare = '<h1 className="text-2xl font-semibold">Indgående fakturaer</h1>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<h1'), 'det er en overskrift')
ok(row.includes('break-words min-w-0'), 'overskriften kan krympe')
ok(row === id, 'overskriften bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.indexOf(id) === view.lastIndexOf(id), 'overskriften findes en gang')
ok(view.split(id).length === 2, 'overskriften findes en gang')
ok(view.split(bare).length === 1, 'den bare overskrift er vaek')
ok(!view.includes(bare), 'den bare overskrift er vaek')
ok(view.includes('Godkend leverandørfakturaer.'), 'indledningens saetning bliver')
ok(view.includes('<span className="text-[11px] text-gray-400 break-words min-w-0">Viser godkendte fakturaer (afventer bogføring/betaling)</span>'), 'forfaldshinten kan stadig krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-heading-wrap-test')
