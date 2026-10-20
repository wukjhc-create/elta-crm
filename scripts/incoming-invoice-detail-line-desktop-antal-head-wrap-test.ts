/**
 * Kolonnen Antal paa fakturalinjens skrivebord kan krympe.
 * Overskriften er uaendret. Konverteringspanelet er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-antal-head-wrap-test.ts
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
const wrapped = '<th className="px-2 py-1 text-right break-words min-w-0">Antal</th>'
const bare = '<th className="px-2 py-1 text-right">Antal</th>'
ok(view.includes(wrapped), 'antalkolonnen kan krympe')
ok(!view.includes(bare), 'den bare antalkolonne er vaek')
ok(view.split(wrapped).length === 2, 'antalkolonnen er en')
ok(!view.includes('break-words break-words'), 'et break-words')

const conv = '<th className="px-2 py-1 break-words min-w-0">Konvertering</th>'
ok(view.includes(conv), 'konverteringskolonnen bliver')
ok(view.split(conv).length === 2, 'konverteringskolonnen er en')

const total = '<th className="px-2 py-1 text-right break-words min-w-0">Total</th>'
ok(view.includes(total), 'totalkolonnen bliver')
ok(view.split(total).length === 2, 'totalkolonnen er en')

const materiale = '<span className="text-[10px] uppercase tracking-wide bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded break-words min-w-0">'
ok(view.includes(materiale), 'materialemaerket bliver')
ok(view.split(materiale).length === 2, 'materialemaerket er et')

const preview = readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
ok(preview.includes(bare), 'konverteringspanelets antal bliver')
ok(preview.split(bare).length === 2, 'konverteringspanelets antal er en')
ok(!preview.includes(wrapped), 'konverteringspanelet er ikke pakket')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-antal-head-wrap-test')
