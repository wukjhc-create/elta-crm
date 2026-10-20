/**
 * Raekken paa fakturalinjens skrivebord kan krympe.
 * Betingelsen for graa baggrund er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-row-wrap-test.ts
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
const wrapped = "<tr key={l.id} className={`border-t break-words min-w-0 ${l.converted_at ? 'bg-gray-50' : ''}`}>"
const bare = "<tr key={l.id} className={`border-t ${l.converted_at ? 'bg-gray-50' : ''}`}>"
ok(view.includes(wrapped), 'linjeraekken kan krympe')
ok(!view.includes(bare), 'den bare linjeraekke er vaek')
ok(view.split(wrapped).length === 2, 'linjeraekken er en')
ok(view.includes("converted_at ? 'bg-gray-50' : ''"), 'baggrunden bliver')
ok(!view.includes('break-words break-words'), 'et break-words')

const skipped = '<span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded break-words min-w-0">'
ok(view.includes(skipped), 'sprunget-over bliver')
ok(view.split(skipped).length === 2, 'sprunget-over er et')

const preview = readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
ok(!preview.includes(wrapped), 'konverteringspanelet er ikke pakket')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-row-wrap-test')
