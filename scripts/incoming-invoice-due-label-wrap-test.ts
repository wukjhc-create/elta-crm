/**
 * Etiketten Forfald paa fakturalisten kan krympe. Teksten bliver.
 *   npx tsx scripts/incoming-invoice-due-label-wrap-test.ts
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
const id = '<span className="text-xs text-gray-500 break-words min-w-0">Forfald:</span>'
const bare = '<span className="text-xs text-gray-500">Forfald:</span>'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at, at + id.length) : ''
ok(row.startsWith('<span'), 'det er en etiket')
ok(row.includes('break-words min-w-0'), 'etiketten kan krympe')
ok(row === id, 'etiketten bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.indexOf(id) === view.lastIndexOf(id), 'etiketten findes en gang')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(bare).length === 1, 'den bare etiket er vaek')
ok(!view.includes(bare), 'den bare etiket er vaek')
ok(view.includes('<p className="text-xs text-gray-500 break-words min-w-0 max-w-xl">'), 'indledningen kan stadig krympe')
ok(view.includes('<h1 className="text-2xl font-semibold break-words min-w-0">Indgående fakturaer</h1>'), 'overskriften kan stadig krympe')
ok(view.includes('>Alle</button>'), 'alle-knappen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-due-label-wrap-test')
