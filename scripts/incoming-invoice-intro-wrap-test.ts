/**
 * Indledningen paa fakturalisten kan krympe. Saetningen bliver.
 *   npx tsx scripts/incoming-invoice-intro-wrap-test.ts
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
const id = '<p className="text-xs text-gray-500 break-words min-w-0 max-w-xl">'
const bare = '<p className="text-xs text-gray-500 break-words max-w-xl">'
const sentence = 'Godkend leverandørfakturaer. Ved godkendelse forsøges bogføring til e-conomic. Lykkes det ikke, er fakturaen stadig godkendt.'
const at = view.indexOf(id)
const sentenceAt = at >= 0 ? view.indexOf(sentence, at) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && sentenceAt >= at ? view.slice(at, sentenceAt + sentence.length) : ''
ok(row.startsWith('<p'), 'det er en indledning')
ok(row.includes('break-words min-w-0'), 'indledningen kan krympe')
ok(row.includes('max-w-xl'), 'bredden bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'saetningen staar i indledningen')
ok(between.indexOf(id) === between.lastIndexOf(id), 'det er den naermeste indledning')
ok(between.includes(sentence), 'saetningen bliver')
ok(view.indexOf(id) === view.lastIndexOf(id), 'indledningen findes en gang')
ok(view.split(id).length === 2, 'indledningen findes en gang')
ok(view.split(bare).length === 1, 'den bare indledning er vaek')
ok(!view.includes(bare), 'den bare indledning er vaek')
ok(view.includes('<h1 className="text-2xl font-semibold break-words min-w-0">Indgående fakturaer</h1>'), 'overskriften kan stadig krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-intro-wrap-test')
