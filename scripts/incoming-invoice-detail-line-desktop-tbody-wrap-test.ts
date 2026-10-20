/**
 * Tabelkroppen paa fakturalinjens skrivebord kan krympe.
 * Mobilkortet er uaendret. Konverteringspanelet er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-tbody-wrap-test.ts
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
const wrapped = '<tbody className="break-words min-w-0">'
const bare = '<tbody>'
ok(view.includes(wrapped), 'tabelkroppen kan krympe')
ok(!view.includes(bare), 'den bare tabelkrop er vaek')
ok(view.split(wrapped).length === 2, 'tabelkroppen er en')
ok(view.includes('data-testid="incoming-invoice-lines-mobile"'), 'mobilkortet bliver')
ok(!view.includes('break-words break-words'), 'et break-words')

const conv = '<td className="px-2 py-1 break-words min-w-0">'
let convCells = 0
let from = 0
while (from < view.length) {
  const at = view.indexOf(conv, from)
  if (at < 0) break
  if (view.slice(at, at + 220).includes("convertedAs === 'material'")) convCells++
  from = at + conv.length
}
ok(convCells === 1, 'konverteringscellen bliver')

const preview = readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
ok(preview.includes(bare), 'konverteringspanelets tabelkrop bliver')
ok(!preview.includes(wrapped), 'konverteringspanelet er ikke pakket')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-tbody-wrap-test')
