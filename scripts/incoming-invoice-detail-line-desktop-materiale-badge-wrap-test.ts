/**
 * Materialemaerket paa fakturalinjens skrivebord kan krympe.
 * Teksten Materiale er uaendret. Oevrig-maerket er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-materiale-badge-wrap-test.ts
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
const wrapped = '<span className="text-[10px] uppercase tracking-wide bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded break-words min-w-0">'
const bare = '<span className="text-[10px] uppercase tracking-wide bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">'
ok(view.includes(wrapped), 'materialemaerket kan krympe')
ok(!view.includes(bare), 'det bare materialemaerke er vaek')
ok(view.split(wrapped).length === 2, 'materialemaerket er et')
ok(view.includes('Materiale'), 'teksten Materiale bliver')
ok(!view.includes('break-words break-words'), 'et break-words')

const oevrig = '<span className="text-[10px] uppercase tracking-wide bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">'
ok(view.includes(oevrig), 'oevrig-maerket bliver')
ok(view.split(oevrig).length === 2, 'oevrig-maerket er et')

const antal = '<th className="px-2 py-1 text-right break-words min-w-0">Antal</th>'
ok(view.includes(antal), 'antalkolonnen bliver')
ok(view.split(antal).length === 2, 'antalkolonnen er en')

const preview = readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
const previewAntal = '<th className="px-2 py-1 text-right">Antal</th>'
ok(preview.includes(previewAntal), 'konverteringspanelets antal bliver')
ok(!preview.includes(wrapped), 'konverteringspanelet er ikke pakket')

const approve = readFileSync('src/app/dashboard/incoming-invoices/[id]/approve-preview-dialog.tsx', 'utf8')
ok(!approve.includes(wrapped), 'forhaandsvisningen er ikke pakket')

const other = readFileSync('src/app/dashboard/orders/[id]/order-other-costs-tab.tsx', 'utf8')
ok(!other.includes(wrapped), 'ovrige omkostninger er ikke pakket')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-materiale-badge-wrap-test')
