/**
 * Konverteringscellen paa fakturalinjens skrivebord kan krympe.
 * Maerkerne er uaendrede. Konverteringspanelet er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-conv-cell-wrap-test.ts
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
const wrapped = '<td className="px-2 py-1 break-words min-w-0">'
const bare = '<td className="px-2 py-1">'
let convCells = 0
let from = 0
while (from < view.length) {
  const at = view.indexOf(wrapped, from)
  if (at < 0) break
  if (view.slice(at, at + 220).includes("convertedAs === 'material'")) convCells++
  from = at + wrapped.length
}
ok(convCells === 1, 'konverteringscellen kan krympe')
ok(!view.includes(bare), 'den bare konverteringscelle er vaek')
ok(view.includes('Materiale'), 'teksten Materiale bliver')
ok(!view.includes('break-words break-words'), 'et break-words')

const row = "<tr key={l.id} className={`border-t break-words min-w-0 ${l.converted_at ? 'bg-gray-50' : ''}`}>"
ok(view.includes(row), 'linjeraekken bliver')
ok(view.split(row).length === 2, 'linjeraekken er en')

const preview = readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
ok(preview.includes(bare), 'konverteringspanelets celle bliver')
ok(!preview.includes(wrapped), 'konverteringspanelet er ikke pakket')

const imported = readFileSync('src/components/modules/customers/customer-import-dialog.tsx', 'utf8')
ok(imported.includes(bare), 'kundeimporten bliver')
ok(!imported.includes(wrapped), 'kundeimporten er ikke pakket')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-conv-cell-wrap-test')
