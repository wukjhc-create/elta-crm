/**
 * Kolonnen Konvertering paa fakturalinjens skrivebord kan krympe.
 * Overskriften er uaendret. Konverteringscellen er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-conv-head-wrap-test.ts
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
const wrapped = '<th className="px-2 py-1 break-words min-w-0">Konvertering</th>'
const bare = '<th className="px-2 py-1">Konvertering</th>'
ok(view.includes(wrapped), 'konverteringskolonnen kan krympe')
ok(!view.includes(bare), 'den bare konverteringskolonne er vaek')
ok(view.split(wrapped).length === 2, 'konverteringskolonnen er en')
ok(!view.includes('break-words break-words'), 'et break-words')

const total = '<th className="px-2 py-1 text-right break-words min-w-0">Total</th>'
ok(view.includes(total), 'totalkolonnen bliver')
ok(view.split(total).length === 2, 'totalkolonnen er en')

const stk = '<th className="px-2 py-1 text-right break-words min-w-0">Stk-pris</th>'
ok(view.includes(stk), 'stkpriskolonnen bliver')
ok(view.split(stk).length === 2, 'stkpriskolonnen er en')

const antal = '<th className="px-2 py-1 text-right break-words min-w-0">Antal</th>'
ok(view.includes(antal), 'antalkolonnen bliver')
ok(view.split(antal).length === 2, 'antalkolonnen er en')

const preview = readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')
const previewAntal = '<th className="px-2 py-1 text-right">Antal</th>'
ok(preview.includes(previewAntal), 'konverteringspanelets antal bliver')
ok(preview.split(previewAntal).length === 2, 'konverteringspanelets antal er en')
ok(!preview.includes(antal), 'konverteringspanelets antal er ikke pakket')
ok(!preview.includes(wrapped), 'konverteringspanelet er ikke pakket')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-conv-head-wrap-test')
