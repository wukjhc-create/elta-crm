/**
 * Listefejlen paa fakturalisten kan krympe. Saetningen bliver.
 *   npx tsx scripts/incoming-invoice-load-error-wrap-test.ts
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
const id = '<p className="text-sm text-red-700 break-words min-w-0" data-testid="incoming-invoices-load-error">'
const bare = '<p className="text-sm text-red-700 break-words" data-testid="incoming-invoices-load-error">'
const sentence = "{listError}{rowsTerm === listTerm && rows.length > 0 ? '. De tidligere fakturaer bliver.' : '. Det tælles ikke som ingen fakturaer.'}"
const at = view.indexOf(id)
const sentenceAt = at >= 0 ? view.indexOf(sentence, at) : -1
const row = at >= 0 ? view.slice(at, at + id.length) : ''
const between = at >= 0 && sentenceAt >= at ? view.slice(at, sentenceAt + sentence.length) : ''
ok(row.startsWith('<p'), 'det er en fejl')
ok(row.includes('break-words min-w-0'), 'fejlen kan krympe')
ok(row.includes('data-testid="incoming-invoices-load-error"'), 'testid bliver')
ok(row === id, 'tagget bliver paa en linje')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(between.startsWith(id), 'saetningen staar i fejlen')
ok(between.indexOf(id) === between.lastIndexOf(id), 'det er den naermeste fejl')
ok(between.includes(sentence), 'saetningen bliver')
ok(view.indexOf(id) === view.lastIndexOf(id), 'fejlen findes en gang')
ok(view.split(id).length === 2, 'fejlen findes en gang')
ok(view.split(bare).length === 1, 'den bare fejl er vaek')
ok(!view.includes(bare), 'den bare fejl er vaek')
ok(view.includes('{listError && ('), 'vagten bliver')
ok(view.includes('<p className="text-sm text-red-700 break-words min-w-0" data-testid="incoming-invoices-counts-error">'), 'taellefejlen kan stadig krympe')
ok(view.includes('<p className="text-sm text-red-700 break-words min-w-0" data-testid="incoming-invoices-senders-error">'), 'afsenderfejlen kan stadig krympe')
ok(view.includes('font-medium text-gray-900 mt-2 break-words min-w-0'), 'mobilbeloebet kan stadig krympe')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-load-error-wrap-test')
