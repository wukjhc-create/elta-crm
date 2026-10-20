/**
 * Oevrig-maerket paa fakturalinjens skrivebord kan krympe.
 * Teksten Oevrig er uaendret. Materialemaerket er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-oevrig-badge-wrap-test.ts
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
const wrapped = '<span className="text-[10px] uppercase tracking-wide bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded break-words min-w-0">'
const bare = '<span className="text-[10px] uppercase tracking-wide bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">'
ok(view.includes(wrapped), 'oevrig-maerket kan krympe')
ok(!view.includes(bare), 'det bare oevrig-maerke er vaek')
ok(view.split(wrapped).length === 2, 'oevrig-maerket er et')
ok(view.includes('Øvrig'), 'teksten Oevrig bliver')
ok(!view.includes('break-words break-words'), 'et break-words')

const materiale = '<span className="text-[10px] uppercase tracking-wide bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded break-words min-w-0">'
ok(view.includes(materiale), 'materialemaerket bliver')
ok(view.split(materiale).length === 2, 'materialemaerket er et')

const ikke = '<span className="text-[10px] text-gray-500 break-words min-w-0">Ikke konverteret</span>'
ok(view.includes(ikke), 'ikke-konverteret bliver')
ok(view.split(ikke).length === 2, 'ikke-konverteret er et')

const preview = readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
ok(!preview.includes(wrapped), 'konverteringspanelet er ikke pakket')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-oevrig-badge-wrap-test')
