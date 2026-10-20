/**
 * Maerket Ikke konverteret paa fakturalinjens skrivebord kan krympe.
 * Teksten er uaendret. Oevrig-maerket er uaendret.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-ikke-badge-wrap-test.ts
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
const wrapped = '<span className="text-[10px] text-gray-500 break-words min-w-0">Ikke konverteret</span>'
const bare = '<span className="text-[10px] text-gray-500">Ikke konverteret</span>'
ok(view.includes(wrapped), 'ikke-konverteret kan krympe')
ok(!view.includes(bare), 'det bare ikke-konverteret er vaek')
ok(view.split(wrapped).length === 2, 'ikke-konverteret er et')
ok(view.includes('Ikke konverteret'), 'teksten bliver')
ok(!view.includes('break-words break-words'), 'et break-words')

const oevrig = '<span className="text-[10px] uppercase tracking-wide bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded break-words min-w-0">'
ok(view.includes(oevrig), 'oevrig-maerket bliver')
ok(view.split(oevrig).length === 2, 'oevrig-maerket er et')

const sprunget = '<span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded break-words min-w-0">'
ok(view.includes(sprunget), 'sprunget-over bliver')
ok(view.split(sprunget).length === 2, 'sprunget-over er et')

const materialDialog = readFileSync('src/app/dashboard/orders/[id]/case-material-dialog.tsx', 'utf8')
ok(materialDialog.includes('<span className="text-[10px] text-gray-500">'), 'materialedialogen bliver')
ok(!materialDialog.includes(wrapped), 'materialedialogen er ikke pakket')

const costDialog = readFileSync('src/app/dashboard/orders/[id]/case-other-cost-dialog.tsx', 'utf8')
ok(costDialog.includes('<span className="text-[10px] text-gray-500">'), 'omkostningsdialogen bliver')
ok(!costDialog.includes(wrapped), 'omkostningsdialogen er ikke pakket')

const mailSettings = readFileSync('src/app/dashboard/settings/invoice-email/invoice-email-settings-client.tsx', 'utf8')
const sprungetBare = '<span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">'
ok(mailSettings.includes(sprungetBare), 'mailindstillingerne bliver')
ok(!mailSettings.includes(sprunget), 'mailindstillingerne er ikke pakket')
ok(!view.includes(sprungetBare), 'det bare sprunget-over er vaek')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-ikke-badge-wrap-test')
