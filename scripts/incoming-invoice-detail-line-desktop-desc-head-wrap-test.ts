/**
 * Kolonnen Beskrivelse paa fakturalinjens skrivebord kan krympe.
 * Overskriften er uaendret. Konverteringspanelet er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-desc-head-wrap-test.ts
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
const wrapped = '<th className="px-2 py-1 break-words min-w-0">Beskrivelse</th>'
const bare = '<th className="px-2 py-1">Beskrivelse</th>'
ok(view.includes(wrapped), 'beskrivelseskolonnen kan krympe')
ok(!view.includes(bare), 'den bare beskrivelseskolonne er vaek')
ok(view.split(wrapped).length === 2, 'beskrivelseskolonnen er en')
ok(!view.includes('break-words break-words'), 'et break-words')

const hash = '<th className="px-2 py-1 break-words min-w-0">#</th>'
ok(view.includes(hash), 'nummerkolonnen bliver')
ok(view.split(hash).length === 2, 'nummerkolonnen er en')

const num = '<td className="px-2 py-1 break-words min-w-0">{l.line_number}</td>'
ok(view.includes(num), 'linjenummercellen bliver')
ok(view.split(num).length === 2, 'linjenummercellen er en')

const enhed = '<th className="px-2 py-1 break-words min-w-0">Enhed</th>'
ok(view.includes(enhed), 'enhedskolonnen bliver')
ok(view.split(enhed).length === 2, 'enhedskolonnen er en')

const preview = readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
ok(preview.includes(bare), 'konverteringspanelets beskrivelse bliver')
ok(preview.split(bare).length === 2, 'konverteringspanelets beskrivelse er en')
ok(!preview.includes(wrapped), 'konverteringspanelet er ikke pakket')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-desc-head-wrap-test')
